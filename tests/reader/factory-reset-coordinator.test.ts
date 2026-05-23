import { afterEach, describe, expect, it, vi } from 'vitest';
import { FactoryResetCoordinator } from '../../src/reader/factory-reset-coordinator';
import { DEFAULT_SETTINGS, endSettingsResetGuard, saveSettings } from '../../src/reader/settings';

describe('FactoryResetCoordinator', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        endSettingsResetGuard();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes the reset coordination signal before reloading', async () => {
        vi.useFakeTimers();
        const gmValues = new Map<string, unknown>();
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => {
            gmValues.set(key, value);
        }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            gmValues.delete(key);
        }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...gmValues.keys()]));
        vi.stubGlobal('BroadcastChannel', undefined);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const reload = vi.fn();
        const coordinator = new FactoryResetCoordinator({
            isDestroyed: () => false,
            getLanguage: () => 'en',
            invalidateRuntimeStores: vi.fn(async () => undefined),
            resetDictionaryDatabase: vi.fn(async () => ({ cleared: true, deleted: true })),
            toast: vi.fn(),
            reload,
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.has('yomu:factory-reset-signal')).toBe(false);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('still clears stored settings when dictionary reset fails', async () => {
        vi.useFakeTimers();
        const gmValues = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', { apiKey: 'still-here' }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => {
            gmValues.set(key, value);
        }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            gmValues.delete(key);
        }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...gmValues.keys()]));
        vi.stubGlobal('BroadcastChannel', undefined);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const reload = vi.fn();
        const toast = vi.fn();
        const coordinator = new FactoryResetCoordinator({
            isDestroyed: () => false,
            getLanguage: () => 'en',
            invalidateRuntimeStores: vi.fn(async () => undefined),
            resetDictionaryDatabase: vi.fn(async () => {
                await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'rewritten-during-reset' });
                throw new Error('indexedDB blocked');
            }),
            toast,
            reload,
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.has('jpdb-popup-reader-settings')).toBe(false);
        expect(gmValues.has('yomu:factory-reset-signal')).toBe(false);
        expect(toast).toHaveBeenCalledWith(expect.stringContaining('Settings were reset'));
        expect(reload).toHaveBeenCalledOnce();
    });
});
