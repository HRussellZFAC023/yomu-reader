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

// Settings edited on yomureader.com historically fell back to that origin's
// localStorage (no GM backend on docs pages before the storage bridge covered
// them), so the jiten key or theme chosen there never followed the user to
// other sites. Once a GM backend is reachable, loadSettings folds those
// stranded values into the shared store — except demo-player staging keys the
// docs theme force-writes, which are not user intent.
describe('stranded hosted settings recovery (yomureader.com localStorage)', () => {
    const hostedLocation = {
        href: 'https://yomureader.com/',
        hostname: 'yomureader.com',
        pathname: '/',
        origin: 'https://yomureader.com',
    };

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('folds stranded jiten key and theme into an existing shared store, ignoring demo staging keys', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { onboardingSeen: true });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            jitenApiKey: 'stranded-key',
            theme: 'dark',
            subtitleControlsMode: 'always',
        }));

        const settings = await loadSettings();
        expect(settings.jitenApiKey).toBe('stranded-key');
        expect(settings.theme).toBe('dark');
        expect(settings.subtitleControlsMode).toBe('auto');

        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('stranded-key');
        expect(shared.theme).toBe('dark');
        expect(shared.onboardingSeen).toBe(true);
    });

    it('keeps the shared store authoritative for values the user set elsewhere', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'dark', jitenApiKey: 'real-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-old-key' }));

        const settings = await loadSettings();
        expect(settings.theme).toBe('dark');
        expect(settings.jitenApiKey).toBe('real-key');
    });

    it('strips demo staging keys when promoting a whole stranded blob into an empty shared store', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            jitenApiKey: 'stranded-key',
            subtitleControlsMode: 'always',
        }));

        const settings = await loadSettings();
        expect(settings.jitenApiKey).toBe('stranded-key');
        expect(settings.subtitleControlsMode).toBe('auto');

        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('stranded-key');
        expect(shared.subtitleControlsMode).not.toBe('always');
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
