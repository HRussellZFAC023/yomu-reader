import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
    loadSettings,
    normalizeReaderSettings,
    promoteStrandedHostedSettingsToGmStorage,
    saveSettings,
    subscribeToSettingsStorageChanges,
} from '../../src/reader/settings/index';

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

function installPackagedExtensionStorage(store: Map<string, unknown>): void {
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    vi.stubGlobal('chrome', {
        runtime: { id: 'reader-extension-id' },
        storage: { local: {
            get: vi.fn(async (key: string | null) => {
                if (key === null) return Object.fromEntries([...store].map(([name, value]) => [name, clone(value)]));
                return store.has(key) ? { [key]: clone(store.get(key)) } : {};
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(items)) store.set(key, clone(value));
            }),
            remove: vi.fn(async (key: string) => {
                store.delete(key);
            }),
        } },
    });
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

    it('does not let a stale whole-settings save resurrect an explicit Japanese-sites opt-out', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, preferJapaneseSiteLanguage: false },
            { persistPreferredJapaneseSiteLanguage: true },
        );

        // A second context still holds the pre-opt-out settings object and
        // saves an unrelated field. Its stale true remains in the blob, but
        // must never overwrite the explicit scalar user intent.
        await saveSettings({ ...staleSettings, theme: 'dark' });

        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            preferJapaneseSiteLanguage: true,
            theme: 'dark',
        });
        expect((await loadSettings()).preferJapaneseSiteLanguage).toBe(false);
    });

    // GitHub #36 (mirrormc), the half with the broad blast radius. Recovery from an
    // older storage key inferred "the learner never set this" from "the value equals
    // the default", so ANY field reset to its default could be replayed from a legacy
    // key and re-persisted -- a cleared API key, a toggle turned back off, a colour
    // put back, any cleared shortcut. Only 15 allowlisted keys were protected.
    it('does not let a legacy settings key resurrect a field the learner reset to its default', async () => {
        const store = new Map<string, unknown>();
        // A legacy install that had a dark theme.
        store.set('yomu-reader-settings', { theme: 'dark' });
        store.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'dark' });
        installSharedMessageBasedGm(store);

        // The learner puts the theme BACK to its default and saves. The settings
        // dialog declares what the edit changed, which is the only trustworthy signal
        // -- a difference measured against storage could just mean another context
        // saved since.
        const settings = await loadSettings();
        await saveSettings({ ...settings, theme: DEFAULT_SETTINGS.theme }, {
            explicitUserChoiceKeys: ['theme'],
        });

        // Recovery spots gaps by comparing against the default -- it has to, because
        // Yomu stores the whole settings object -- so without the recorded choice the
        // legacy 'dark' is treated as filling a gap and comes back, re-persisted, on
        // every load. That is what the reporter saw seconds after saving and again
        // after a version update.
        expect((await loadSettings()).theme).toBe(DEFAULT_SETTINGS.theme);
        expect(await loadSettings().then(value => value.theme)).toBe(DEFAULT_SETTINGS.theme);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: DEFAULT_SETTINGS.theme });
    });

    it('still fills a field the current store has never stored at all', async () => {
        const store = new Map<string, unknown>();
        // The recovery has a real job: a genuinely absent key must still be adopted,
        // which is what the presence check preserves and the equality check conflated.
        store.set('yomu-reader-settings', { ankiTags: 'legacy-tag' });
        store.set(SETTINGS_STORAGE_KEY, { theme: 'dark' });
        installSharedMessageBasedGm(store);

        expect((await loadSettings()).ankiTags).toBe('legacy-tag');
    });

    it('does not let a stale whole-settings save overwrite an explicit annotations choice', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, annotationsPaused: false },
            {
                // Cast keeps this regression executable against the pre-fix
                // implementation, where the option does not exist yet.
                explicitUserChoiceKeys: ['annotationsPaused'],
            } as Parameters<typeof saveSettings>[1],
        );

        await saveSettings({ ...staleSettings, annotationsPaused: true, theme: 'dark' });

        expect((await loadSettings()).annotationsPaused).toBe(false);
    });

    it('normalizes malformed Japanese-sites preferences without truthy coercion', async () => {
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { preferJapaneseSiteLanguage: 'true' }],
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, 'true'],
        ]);
        installSharedMessageBasedGm(store);

        const normalized = normalizeReaderSettings({
            preferJapaneseSiteLanguage: 'false' as unknown as boolean,
        });
        expect(normalized.preferJapaneseSiteLanguage).toBe(false);
        expect(typeof normalized.preferJapaneseSiteLanguage).toBe('boolean');
        expect(normalizeReaderSettings({}).preferJapaneseSiteLanguage).toBe(
            DEFAULT_SETTINGS.preferJapaneseSiteLanguage,
        );

        const loaded = await loadSettings();
        expect(loaded.preferJapaneseSiteLanguage).toBe(false);
        expect(typeof loaded.preferJapaneseSiteLanguage).toBe('boolean');
        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
    });

    it('reloads authoritative settings when either the blob or scalar changes', async () => {
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { preferJapaneseSiteLanguage: true, theme: 'light' }],
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, false],
        ]);
        installSharedMessageBasedGm(store);
        type StoredValueListener = (
            key: string,
            oldValue: unknown,
            newValue: unknown,
            remote: boolean,
        ) => void;
        const listeners = new Map<string, StoredValueListener>();
        vi.stubGlobal('GM_addValueChangeListener', vi.fn((
            key: string,
            listener: StoredValueListener,
        ) => {
            listeners.set(key, listener);
            return listeners.size;
        }));
        const removeListener = vi.fn();
        vi.stubGlobal('GM_removeValueChangeListener', removeListener);
        const onSettings = vi.fn();
        const unsubscribe = subscribeToSettingsStorageChanges(onSettings);

        const updatedBlob = { preferJapaneseSiteLanguage: true, theme: 'dark' };
        store.set(SETTINGS_STORAGE_KEY, updatedBlob);
        listeners.get(SETTINGS_STORAGE_KEY)?.(
            SETTINGS_STORAGE_KEY,
            null,
            updatedBlob,
            true,
        );
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
        expect(onSettings.mock.calls[0]?.[0]).toMatchObject({
            preferJapaneseSiteLanguage: false,
            theme: 'dark',
        });

        store.set(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, true);
        listeners.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)?.(
            PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
            false,
            true,
            true,
        );
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(2));
        expect(onSettings.mock.calls[1]?.[0].preferJapaneseSiteLanguage).toBe(true);

        unsubscribe();
        expect(removeListener).toHaveBeenCalledTimes(3);
    });
});

describe('settings persist in packaged-extension storage', () => {
    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('keeps explicit annotations intent authoritative over a stale extension save', async () => {
        const store = new Map<string, unknown>();
        installPackagedExtensionStorage(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, annotationsPaused: false },
            { explicitUserChoiceKeys: ['annotationsPaused'] },
        );
        await saveSettings({ ...staleSettings, annotationsPaused: true, theme: 'dark' });

        expect((await loadSettings()).annotationsPaused).toBe(false);
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

    // Owner report 2026-07-29: "if I toggle annotations on and refresh the page
    // it goes back to off state". Turning annotations back ON writes
    // `annotationsPaused: false`, which IS the default, so recovery that infers
    // intent from "differs from the default" read the choice as unset and let
    // the shared store's `true` win on the next load. The write records the
    // field it changed, so intent is available and does not need inferring.
    it('recovers an explicit hosted choice that happens to equal the default', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        // Annotations are OFF in the shared store, i.e. a non-default value.
        store.set('jpdb-popup-reader-settings', { annotationsPaused: true });

        // The hosted page reads, giving the next write a baseline to diff.
        const beforeToggle = await loadSettings();
        expect(beforeToggle.annotationsPaused).toBe(true);

        // The learner toggles annotations ON inside the hosted app, which has
        // no GM store of its own, so the write strands in this origin's
        // localStorage. A present-but-dead GM_setValue is that same path.
        vi.stubGlobal('GM_setValue', vi.fn(async () => {
            throw new Error('hosted app has no GM bridge');
        }));
        // A rejected shared write is now reported rather than swallowed, so the
        // save throws while still leaving the origin-local recovery copy behind.
        await expect(saveSettings({ ...beforeToggle, annotationsPaused: false }))
            .rejects.toThrow(/GM storage write failed/);
        expect(store.get('jpdb-popup-reader-settings')).toEqual({ annotationsPaused: true });

        // Reload with the shared store readable again: the choice must survive
        // even though `false` is this setting's default value.
        installSharedMessageBasedGm(store);
        const afterRefresh = await loadSettings();
        expect(afterRefresh.annotationsPaused).toBe(false);
    });

    it('still ignores a stale hosted default nobody chose', async () => {
        // The guard the fix must not remove: an untouched hosted copy sitting
        // at a default cannot overwrite a real choice made on another site.
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { annotationsPaused: true });
        // No preceding read, so no recorded intent: just a blob at the default.
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ annotationsPaused: false }));

        const settings = await loadSettings();
        expect(settings.annotationsPaused).toBe(true);
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

// Until 1.8.39 the default theme was 'light' and every save persisted it, so a
// stored 'light' cannot be told apart from a real choice — and because the
// hosted appearance boot reads settings.theme before its 'auto' fallback, those
// installs could never follow the operating system. Measured on the live site:
// a browser that had visited before the fix still carried theme=light and stayed
// bright with prefers-color-scheme: dark.
describe('default light theme migration', () => {
    it('moves a stored light default to auto once, then honors a later choice', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'light' });

        const migrated = await loadSettings();
        expect(migrated.theme).toBe('auto');
        expect(migrated.themeAutoRestored20260730).toBe(true);

        // Choosing light AFTER the migration is a real choice and must stick.
        migrated.theme = 'light';
        await saveSettings(migrated);
        expect((await loadSettings()).theme).toBe('light');
    });

    it('leaves a stored dark choice alone', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'dark' });
        expect((await loadSettings()).theme).toBe('dark');
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
