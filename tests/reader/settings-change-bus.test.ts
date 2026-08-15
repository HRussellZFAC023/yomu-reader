import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    publishSettingsChange,
    subscribeToSettingsChanges,
} from '../../src/reader/settings/settings-change-bus';
import {
    DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
});

describe('private settings change bus', () => {
    it('isolates a throwing subscriber after a durable settings commit', () => {
        const failure = new Error('subscriber failed');
        const throwingListener = vi.fn(() => { throw failure; });
        const observingListener = vi.fn();
        const unsubscribeThrowing = subscribeToSettingsChanges(throwingListener);
        const unsubscribeObserving = subscribeToSettingsChanges(observingListener);

        try {
            expect(() => publishSettingsChange({ settings: { theme: 'dark' } })).not.toThrow();
            expect(throwingListener).toHaveBeenCalledOnce();
            expect(observingListener).toHaveBeenCalledWith({ settings: { theme: 'dark' } });
        } finally {
            unsubscribeThrowing();
            unsubscribeObserving();
        }
    });

    it('keeps a completed save successful when one subscriber throws', async () => {
        const store = new Map<string, unknown>();
        installGmStorageFixture(store);
        const throwingListener = vi.fn(() => { throw new Error('subscriber failed'); });
        const observingListener = vi.fn();
        const unsubscribeThrowing = subscribeToSettingsChanges(throwingListener);
        const unsubscribeObserving = subscribeToSettingsChanges(observingListener);

        try {
            await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, {
                explicitUserChoiceKeys: ['theme'],
            })).resolves.toBeUndefined();
            expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'dark' });
            await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
            expect(throwingListener).toHaveBeenCalledOnce();
            expect(observingListener).toHaveBeenCalledWith(expect.objectContaining({
                settings: expect.objectContaining({ theme: 'dark' }),
            }));
        } finally {
            unsubscribeThrowing();
            unsubscribeObserving();
        }
    });
});
