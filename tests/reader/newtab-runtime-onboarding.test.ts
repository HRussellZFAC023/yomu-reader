import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/reader/companions/register-build-companions';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';

describe('packaged Study welcome integration', () => {
    afterEach(() => {
        document.body.replaceChildren();
        document.documentElement.removeAttribute('data-yomu-newtab-runtime');
        localStorage.clear();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('constructs the real welcome controller with Study opt-in unchecked', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            onboarding: { showIfNeeded(): Promise<boolean> };
        };
        internals.settings = { ...DEFAULT_SETTINGS, onboardingSeen: false, newTabEnabled: true };

        await expect(internals.onboarding.showIfNeeded()).resolves.toBe(true);

        expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        expect(document.querySelector<HTMLInputElement>('input[name="newTabEnabled"]')?.checked).toBe(false);
    });

    it('shows welcome after the disabled Study surface on extension startup', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            newTabEnabled: false,
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
});
