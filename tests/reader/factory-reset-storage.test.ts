import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearManagedStoredValues } from '../../src/reader/app/storage';
import { DEFAULT_SETTINGS, deleteSettingsStorage, endSettingsResetGuard, loadSettings } from '../../src/reader/settings/index';

describe('factory reset storage completeness', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        endSettingsResetGuard();
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('clears Yomu-owned hosted web-storage keys, including __yomu internal keys, while leaving foreign keys', async () => {
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ apiKey: 'k' }));
        localStorage.setItem('jpdb-reader-source-open-state', JSON.stringify({ __jiten__: true }));
        localStorage.setItem('yomu:jpdb-cache:v1', JSON.stringify({ x: 1 }));
        localStorage.setItem('yomu:srs-local:v1', JSON.stringify({ cards: {} }));
        localStorage.setItem('__yomu_cloud_settings_sync_pending_action', JSON.stringify({ action: 'save' }));
        localStorage.setItem('foreign-site-token', 'keep-me');

        const removed = await clearManagedStoredValues();

        expect(localStorage.getItem('jpdb-popup-reader-settings')).toBeNull();
        expect(localStorage.getItem('jpdb-reader-source-open-state')).toBeNull();
        expect(localStorage.getItem('yomu:jpdb-cache:v1')).toBeNull();
        expect(localStorage.getItem('yomu:srs-local:v1')).toBeNull();
        expect(localStorage.getItem('__yomu_cloud_settings_sync_pending_action')).toBeNull();
        expect(localStorage.getItem('foreign-site-token')).toBe('keep-me');
        expect(removed).toBeGreaterThanOrEqual(5);
    });

    it('sweeps all GM storage keys on the userscript path', async () => {
        const store = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', { apiKey: 'k' }],
            ['__yomu_cloud_settings_sync_pending_action', { action: 'save' }],
            ['yomu:jpdb-cache:v1', { x: 1 }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback)));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { store.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { store.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...store.keys()]));

        await clearManagedStoredValues();

        expect(store.size).toBe(0);
    });

    it('clears Study PWA caches and only unregisters Study service workers', async () => {
        const caches = new Set(['yomu-newtab-v1', 'yomu-newtab-v2', 'foreign-cache']);
        const deleteCache = vi.fn(async (key: string) => caches.delete(key));
        const unregisterNewtab = vi.fn(async () => true);
        const unregisterDocs = vi.fn(async () => true);
        vi.stubGlobal('caches', {
            keys: vi.fn(async () => [...caches]),
            delete: deleteCache,
        });
        vi.stubGlobal('navigator', {
            serviceWorker: {
                getRegistrations: vi.fn(async () => [
                    {
                        scope: 'https://yomureader.com/newtab/',
                        active: { scriptURL: 'https://yomureader.com/newtab/sw.js' },
                        unregister: unregisterNewtab,
                    },
                    {
                        scope: 'https://yomureader.com/',
                        active: { scriptURL: 'https://yomureader.com/sw.js' },
                        unregister: unregisterDocs,
                    },
                ]),
            },
        });

        const removed = await clearManagedStoredValues();

        expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-v1');
        expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-v2');
        expect(deleteCache).not.toHaveBeenCalledWith('foreign-cache');
        expect(caches.has('foreign-cache')).toBe(true);
        expect(unregisterNewtab).toHaveBeenCalledOnce();
        expect(unregisterDocs).not.toHaveBeenCalled();
        expect(removed).toBeGreaterThanOrEqual(3);
    });

    it('clears lookup pill selections so settings return to defaults after reset', async () => {
        const customLinks = DEFAULT_SETTINGS.dictionaryLookupLinks.slice(0, 1);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            apiKey: 'secret-123',
            dictionaryLookupLinks: customLinks,
        }));

        const before = await loadSettings();
        expect(before.apiKey).toBe('secret-123');

        await clearManagedStoredValues();
        await deleteSettingsStorage();

        expect(localStorage.getItem('jpdb-popup-reader-settings')).toBeNull();
        const after = await loadSettings();
        expect(after.apiKey).toBe(DEFAULT_SETTINGS.apiKey);
        expect(after.dictionaryLookupLinks.map(link => link.id).sort()).toEqual(DEFAULT_SETTINGS.dictionaryLookupLinks.map(link => link.id).sort());
        expect(after.dictionaryLookupLinks.length).toBeGreaterThan(customLinks.length);
    });
});
