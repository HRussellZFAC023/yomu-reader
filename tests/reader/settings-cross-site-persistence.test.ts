import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from '../../src/reader/settings/index';

// Simulate a message-based userscript manager (Greasemonkey 4 / Safari
// Userscripts / FireMonkey): every GM.getValue call structured-clones both the
// stored value AND the default it hands back, and the store is shared across
// every site the script runs on (that is what GM storage is). This is the
// exact environment behind the report — turning furigana off on one site,
// then finding the onboarding popup and furigana back on the next.
function installSharedMessageBasedGm(store: Map<string, unknown>): void {
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
        clone(store.has(key) ? store.get(key) : fallback)));
    vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
        store.set(key, clone(value));
    }));
    vi.stubGlobal('GM_deleteValue', vi.fn(async (key: string) => {
        store.delete(key);
    }));
}

describe('settings persist across sites (message-based GM store)', () => {
    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('keeps furigana-off and onboarding-seen when navigating to the next site', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        // Site A: complete onboarding, turn furigana off.
        const onSiteA = await loadSettings();
        await saveSettings({ ...onSiteA, onboardingSeen: true, showFurigana: false, furiganaMode: 'off' });

        // Site B: fresh page load reads the shared GM store.
        const onSiteB = await loadSettings();
        expect(onSiteB.onboardingSeen).toBe(true);
        expect(onSiteB.showFurigana).toBe(false);
        expect(onSiteB.furiganaMode).toBe('off');
    });

    it('does not resurface onboarding for a brand-new user before they save anything', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const fresh = await loadSettings();
        // Fresh user: no stored value, so onboarding SHOULD show once — but the
        // loaded record must not be polluted by the missing-sentinel clone.
        expect(fresh.onboardingSeen).toBe(false);
        expect(JSON.stringify(fresh)).not.toContain('__yomuStorageValueMissing');
        expect(await loadSettings()).toBeTruthy();
    });
});

// Until 1.6.140 the YouTube filter notice's "hide" button silently persisted
// youtubeShowFilterNotice=false — the only in-page path writing that key.
// The one-time marker migration restores it; deliberate settings-dialog
// choices made afterwards stick.
describe('hidden filter notice restore migration', () => {
    it('restores a stored notice-off once, then honors later choices', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { youtubeShowFilterNotice: false });

        const migrated = await loadSettings();
        expect(migrated.youtubeShowFilterNotice).toBe(true);
        expect(migrated.youtubeFilterNoticeRestored20260711).toBe(true);

        // A post-migration deliberate opt-out sticks across loads.
        migrated.youtubeShowFilterNotice = false;
        await saveSettings(migrated);
        const reloaded = await loadSettings();
        expect(reloaded.youtubeShowFilterNotice).toBe(false);
    });
});
