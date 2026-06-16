import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getUserscriptGmStorage,
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';

const HOSTED_LOCATION = {
    href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
    hostname: 'hrussellzfac023.github.io',
    pathname: '/yomu-reader/newtab/index.html',
    origin: 'https://hrussellzfac023.github.io',
};

function stubGmStore(values: Map<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
}

describe('userscript GM storage bridge', () => {
    beforeEach(() => {
        vi.stubGlobal('location', HOSTED_LOCATION);
    });

    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        vi.unstubAllGlobals();
    });

    it('returns no bridge for the page until one is installed', () => {
        expect(getUserscriptGmStorage()).toBeUndefined();
    });

    it('round-trips managed get/set/delete/list across the event bridge', async () => {
        const values = new Map<string, unknown>([['jpdb-popup-reader-settings', { theme: 'light' }]]);
        stubGmStore(values);
        installUserscriptGmStorageBridge();

        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBe('true');
        const storage = getUserscriptGmStorage();
        expect(storage).toBeDefined();
        if (!storage) return;

        await expect(storage.getValue('jpdb-popup-reader-settings', null)).resolves.toEqual({ theme: 'light' });

        await storage.setValue('jpdb-popup-reader-settings', { theme: 'dark' });
        expect(values.get('jpdb-popup-reader-settings')).toEqual({ theme: 'dark' });
        await expect(storage.getValue('jpdb-popup-reader-settings', null)).resolves.toEqual({ theme: 'dark' });

        await expect(storage.listValues()).resolves.toContain('jpdb-popup-reader-settings');

        await storage.deleteValue('jpdb-popup-reader-settings');
        expect(values.has('jpdb-popup-reader-settings')).toBe(false);
    });

    it('returns the fallback for a missing managed key', async () => {
        stubGmStore(new Map());
        installUserscriptGmStorageBridge();
        const storage = getUserscriptGmStorage();
        expect(storage).toBeDefined();
        if (!storage) return;

        const fallback = { default: true };
        await expect(storage.getValue('yomu:enable-logs', fallback)).resolves.toBe(fallback);
    });

    it('refuses to read or write storage keys Yomu does not own', async () => {
        stubGmStore(new Map([['evil-site-token', 'secret']]));
        installUserscriptGmStorageBridge();
        const storage = getUserscriptGmStorage();
        expect(storage).toBeDefined();
        if (!storage) return;

        await expect(storage.getValue('evil-site-token', null)).rejects.toThrow();
        await expect(storage.setValue('evil-site-token', 'changed')).rejects.toThrow();
    });

    it('does not install on a non-hosted origin', () => {
        vi.stubGlobal('location', { href: 'https://jpdb.io/learn', hostname: 'jpdb.io', pathname: '/learn', origin: 'https://jpdb.io' });
        stubGmStore(new Map());
        installUserscriptGmStorageBridge();
        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBeUndefined();
        expect(getUserscriptGmStorage()).toBeUndefined();
    });
});
