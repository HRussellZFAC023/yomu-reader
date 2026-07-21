import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, promoteStrandedHostedSettingsToGmStorage, saveSettings } from '../../src/reader/settings/index';

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

    it('eagerly promotes a hosted-app jiten key + dark theme into the shared GM store from the userscript sandbox', async () => {
        // The userscript entry runs this at document-start on yomureader.com;
        // it must push the key + theme into GM so youtube.com (which reads GM)
        // no longer falls back to defaults (light theme, no key).
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'hosted-key', theme: 'dark' }));

        const promoted = await promoteStrandedHostedSettingsToGmStorage();
        expect(promoted).toBe(true);
        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('hosted-key');
        expect(shared.theme).toBe('dark');

        // A subsequent load on another site (shared store) now sees them.
        vi.stubGlobal('location', { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/', origin: 'https://www.youtube.com' });
        const onYouTube = await loadSettings();
        expect(onYouTube.jitenApiKey).toBe('hosted-key');
        expect(onYouTube.theme).toBe('dark');
    });

    it('is a no-op on a non-hosted origin and never clobbers an explicit GM choice', async () => {
        // Off yomureader.com: nothing to promote (cross-origin localStorage is
        // isolated), so it must not run.
        vi.stubGlobal('location', { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/', origin: 'https://www.youtube.com' });
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'should-not-promote' }));
        expect(await promoteStrandedHostedSettingsToGmStorage()).toBe(false);
        expect(store.get('jpdb-popup-reader-settings')).toBeUndefined();

        // On the hosted origin, a stale hosted default must not overwrite an
        // explicit GM key set elsewhere.
        vi.stubGlobal('location', hostedLocation);
        store.set('jpdb-popup-reader-settings', { jitenApiKey: 'real-gm-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-hosted-key' }));
        await promoteStrandedHostedSettingsToGmStorage();
        expect((store.get('jpdb-popup-reader-settings') as Record<string, unknown>).jitenApiKey).toBe('real-gm-key');
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

    it('promotes a hosted save made before a late GM bridge and then clears the pending marker', async () => {
        vi.stubGlobal('location', hostedLocation);
        const standalone = await loadSettings();
        await saveSettings({ ...standalone, theme: 'dark', lookupOnHover: false, jitenApiKey: 'local-choice' });

        const localBeforeBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localBeforeBridge.__yomuHostedPendingGmPatch).toMatchObject({
            theme: 'dark',
            lookupOnHover: false,
            jitenApiKey: 'local-choice',
        });

        const store = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { onboardingSeen: true, theme: 'light', popupMode: 'popover', lookupOnHover: true, jitenApiKey: 'gm-old-choice' },
        ]]);
        installSharedMessageBasedGm(store);

        const reconciled = await loadSettings();
        expect(reconciled.theme).toBe('dark');
        expect(reconciled.lookupOnHover).toBe(false);
        expect(reconciled.jitenApiKey).toBe('local-choice');
        expect(reconciled.onboardingSeen).toBe(true);
        expect(reconciled.popupMode).toBe('popover');
        expect(store.get('jpdb-popup-reader-settings')).toMatchObject({
            onboardingSeen: true,
            theme: 'dark',
            popupMode: 'popover',
            lookupOnHover: false,
            jitenApiKey: 'local-choice',
        });
        expect(store.get('jpdb-popup-reader-settings')).not.toHaveProperty('__yomuHostedPendingGmPatch');

        const localAfterBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localAfterBridge.__yomuHostedPendingGmPatch).toBeUndefined();
    });

    it('merges only the pending hosted fields into newer GM changes from another site', async () => {
        vi.stubGlobal('location', hostedLocation);
        const initialStore = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { theme: 'light', popupMode: 'sheet', lookupOnHover: true },
        ]]);
        installSharedMessageBasedGm(initialStore);
        await loadSettings();
        vi.unstubAllGlobals();
        vi.stubGlobal('location', hostedLocation);

        const local = await loadSettings();
        await saveSettings({ ...local, theme: 'dark' });

        const currentStore = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { theme: 'light', popupMode: 'popover', lookupOnHover: false },
        ]]);
        installSharedMessageBasedGm(currentStore);
        const reconciled = await loadSettings();

        expect(reconciled.theme).toBe('dark');
        expect(reconciled.popupMode).toBe('popover');
        expect(reconciled.lookupOnHover).toBe(false);
    });

    it('keeps GM settings after the hosted localStorage mirror is cleared', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        const settings = await loadSettings();
        await saveSettings({ ...settings, theme: 'dark', lookupOnHover: false, jitenApiKey: 'durable-key' });

        localStorage.clear();
        const reloaded = await loadSettings();
        expect(reloaded.theme).toBe('dark');
        expect(reloaded.lookupOnHover).toBe(false);
        expect(reloaded.jitenApiKey).toBe('durable-key');
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
