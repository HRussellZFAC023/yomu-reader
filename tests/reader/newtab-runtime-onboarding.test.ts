import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/reader/companions/register-build-companions';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { installUserscriptGmStorageBridge, uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';

describe('packaged Study welcome integration', () => {
    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        document.body.replaceChildren();
        document.documentElement.removeAttribute('data-yomu-newtab-runtime');
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('constructs the real welcome controller without a new-tab takeover option', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            onboarding: { showIfNeeded(): Promise<boolean> };
        };
        internals.settings = { ...DEFAULT_SETTINGS, onboardingSeen: false };

        await expect(internals.onboarding.showIfNeeded()).resolves.toBe(true);

        expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        expect(document.querySelector('input[name="newTabEnabled"]')).toBeNull();
        expect(document.body.textContent).not.toContain('Set Study as the new tab');
    });

    it('starts only the standalone Study surface at Word', () => {
        const standalone = new NewTabRuntime() as unknown as {
            createNewTabController(): { initialStudyStepIdPending: string | null };
        };
        const academy = new NewTabRuntime({ mountHost: document.createElement('main') }) as unknown as {
            createNewTabController(): { initialStudyStepIdPending: string | null };
        };

        expect(standalone.createNewTabController().initialStudyStepIdPending).toBe('word');
        expect(academy.createNewTabController().initialStudyStepIdPending).toBeNull();
    });

    it('shows welcome after rendering the packaged Study surface', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            localDictionariesEnabled: false,
        }));
        const runtime = new NewTabRuntime();
        const calls: string[] = [];
        const internals = runtime as unknown as Record<string, unknown>;
        internals.installExternalRefreshListener = vi.fn();
        internals.factoryReset = { bind: vi.fn(), destroy: vi.fn() };
        internals.createNewTabController = vi.fn(() => ({
            renderPage: vi.fn(async () => { calls.push('render'); }),
            isCurrentPage: vi.fn(() => true),
            destroy: vi.fn(),
        }));
        internals.onboarding = {
            showIfNeeded: vi.fn(async () => { calls.push('welcome'); return true; }),
        };
        internals.refreshDictionaryStyles = vi.fn(async () => undefined);
        internals.scheduleAnkiStatusWarmup = vi.fn();
        internals.installCardStateSignalSubscription = vi.fn();
        internals.installSettingsStorageSubscription = vi.fn();
        internals.settingsDialog = { resumePendingCloudSettingsSync: vi.fn(async () => undefined) };

        await runtime.init();

        expect(calls).toEqual(['render', 'welcome']);
    });

    it('opens account settings from the Firefox-safe Study link after welcome', async () => {
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com' } });
        window.history.replaceState({}, '', '/newtab/index.html#settings=api');
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            onboardingSeen: true,
            localDictionariesEnabled: false,
        }));
        const runtime = new NewTabRuntime();
        const calls: string[] = [];
        const internals = runtime as unknown as Record<string, unknown>;
        internals.installExternalRefreshListener = vi.fn();
        internals.factoryReset = { bind: vi.fn(), destroy: vi.fn() };
        internals.createNewTabController = vi.fn(() => ({
            renderPage: vi.fn(async () => { calls.push('render'); }),
            isCurrentPage: vi.fn(() => true),
            destroy: vi.fn(),
        }));
        internals.onboarding = {
            showIfNeeded: vi.fn(async () => { calls.push('welcome'); return false; }),
        };
        internals.refreshDictionaryStyles = vi.fn(async () => undefined);
        internals.scheduleAnkiStatusWarmup = vi.fn();
        internals.installCardStateSignalSubscription = vi.fn();
        internals.installSettingsStorageSubscription = vi.fn();
        internals.settingsDialog = {
            open: vi.fn((panel: string) => { calls.push(`settings:${panel}`); }),
            resumePendingCloudSettingsSync: vi.fn(async () => undefined),
        };

        await runtime.init();

        expect(calls).toEqual(['render', 'welcome', 'settings:api']);
        expect(location.hash).toBe('');
    });

    it('reloads settings when a late userscript storage bridge reaches the Study runtime', async () => {
        window.history.replaceState({}, '', '/newtab/index.html');
        const runtime = new NewTabRuntime();
        const applyRemoteSettings = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            isDestroyed: boolean;
            applyRemoteSettings: typeof applyRemoteSettings;
            installSettingsStorageSubscription(): void;
        };
        internals.isDestroyed = false;
        internals.applyRemoteSettings = applyRemoteSettings;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            __yomuHostedPendingGmPatch: { theme: 'dark' },
        }));
        const shared = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'light', popupMode: 'popover' }]]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => shared.has(key) ? shared.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { shared.set(key, value); }));

        internals.installSettingsStorageSubscription();
        installUserscriptGmStorageBridge();

        await vi.waitFor(() => expect(applyRemoteSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', popupMode: 'popover' })));
        expect(shared.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'dark', popupMode: 'popover' });
        expect(shared.get(SETTINGS_STORAGE_KEY)).not.toHaveProperty('__yomuHostedPendingGmPatch');
        runtime.destroy();
    });
});
