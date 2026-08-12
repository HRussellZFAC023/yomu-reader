import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearManagedStoredValues } from '../../src/reader/app/storage';
import { DEFAULT_SETTINGS, deleteSettingsStorage, endSettingsResetGuard, loadSettings } from '../../src/reader/settings/index';

function installMutableGmStore(store: Map<string, unknown>): void {
    const api = {
        GM_getValue(key: string, fallback: unknown) {
            return store.has(key) ? store.get(key) : fallback;
        },
        GM_setValue(key: string, value: unknown) {
            store.set(key, value);
        },
        GM_deleteValue(key: string) {
            store.delete(key);
        },
        GM_listValues() {
            return [...store.keys()];
        },
    };
    Object.entries(api).forEach(([name, implementation]) => {
        vi.stubGlobal(name, vi.fn(implementation));
    });
}

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
        installMutableGmStore(store);

        await clearManagedStoredValues();

        expect(store.size).toBe(0);
    });

    it('clears all Yomu PWA caches and unregisters Yomu service workers', async () => {
        const caches = new Set([
            'yomu-newtab-v1',
            'yomu-newtab-v2',
            'yomu-pdf-reader-v1.4.196',
            'yomu-video-player-v1',
            'yomu-docs-shell-v1',
            'foreign-cache',
        ]);
        const deleteCache = vi.fn(async (key: string) => caches.delete(key));
        const unregisterNewtab = vi.fn(async () => true);
        const unregisterDocs = vi.fn(async () => true);
        const unregisterPdf = vi.fn(async () => true);
        const unregisterForeign = vi.fn(async () => true);
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
                    {
                        scope: 'https://yomureader.com/pdf-reader/',
                        active: { scriptURL: 'https://yomureader.com/pdf-reader/sw.js' },
                        unregister: unregisterPdf,
                    },
                    {
                        scope: 'https://example.com/',
                        active: { scriptURL: 'https://example.com/sw.js' },
                        unregister: unregisterForeign,
                    },
                ]),
            },
        });

        const removed = await clearManagedStoredValues();

        expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-v1');
        expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-v2');
        expect(deleteCache).toHaveBeenCalledWith('yomu-pdf-reader-v1.4.196');
        expect(deleteCache).toHaveBeenCalledWith('yomu-video-player-v1');
        expect(deleteCache).toHaveBeenCalledWith('yomu-docs-shell-v1');
        expect(deleteCache).not.toHaveBeenCalledWith('foreign-cache');
        expect(caches.has('foreign-cache')).toBe(true);
        expect(unregisterNewtab).toHaveBeenCalledOnce();
        expect(unregisterDocs).toHaveBeenCalledOnce();
        expect(unregisterPdf).toHaveBeenCalledOnce();
        expect(unregisterForeign).not.toHaveBeenCalled();
        expect(removed).toBeGreaterThanOrEqual(8);
    });

    it('clears lookup pill selections so settings return to defaults after reset', async () => {
        const customLinks = DEFAULT_SETTINGS.dictionaryLookupLinks.slice(0, 1);
        const store = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { apiKey: 'secret-123', dictionaryLookupLinks: customLinks },
        ]]);
        installMutableGmStore(store);

        const before = await loadSettings();
        expect(before.apiKey).toBe('secret-123');

        await clearManagedStoredValues();
        await deleteSettingsStorage();

        expect(store.has('jpdb-popup-reader-settings')).toBe(false);
        const after = await loadSettings();
        expect(after.apiKey).toBe(DEFAULT_SETTINGS.apiKey);
        expect(after.dictionaryLookupLinks.map(link => link.id).sort()).toEqual(DEFAULT_SETTINGS.dictionaryLookupLinks.map(link => link.id).sort());
        expect(after.dictionaryLookupLinks.length).toBeGreaterThan(customLinks.length);
    });
});
