import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    beginSettingsResetGuard,
    endSettingsResetGuard,
    saveSettings,
} from '../../src/reader/settings/index';

describe('settings reset guard', () => {
    afterEach(() => {
        endSettingsResetGuard();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('rejects a save during reset instead of reporting a skipped write as successful', async () => {
        const stored = { ...DEFAULT_SETTINGS, theme: 'light' as const };
        const values = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, stored]]);
        const setValue = vi.fn((key: string, value: unknown) => {
            values.set(key, value);
        });
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) =>
            values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', setValue);
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            values.delete(key);
        }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));

        beginSettingsResetGuard();
        await expect(saveSettings({ ...stored, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        })).rejects.toMatchObject({
            message: '',
        });

        expect(setValue).not.toHaveBeenCalled();
        expect(values.get(SETTINGS_STORAGE_KEY)).toBe(stored);
    });
});
