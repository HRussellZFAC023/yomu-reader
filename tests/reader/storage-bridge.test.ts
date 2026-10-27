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

async function expectMissingManagedValueFallback(): Promise<void> {
    const storage = getUserscriptGmStorage();
    expect(storage).toBeDefined();
    if (!storage) throw new Error('Storage bridge did not install.');
    const fallback = { default: true };
    await expect(storage.getValue('yomu:enable-logs', fallback)).resolves.toBe(fallback);
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
        await expectMissingManagedValueFallback();
    });

    it('reads and enumerates the authoritative API instead of a stale synchronous snapshot', async () => {
        stubGmStore(new Map([['jpdb-popup-reader-settings', { theme: 'light' }]]));
        const durable = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', { theme: 'dark' }],
            ['yomu:enable-logs', false],
        ]);
        vi.stubGlobal('GM', {
            getValue: async (key: string, fallback: unknown) => durable.has(key) ? durable.get(key) : fallback,
            listValues: async () => [...durable.keys()],
        });
        installUserscriptGmStorageBridge();
        const bridge = getUserscriptGmStorage()!;

        await expect(bridge.getValue('jpdb-popup-reader-settings', null)).resolves.toEqual({ theme: 'dark' });
        await expect(bridge.listValues()).resolves.toContain('yomu:enable-logs');
        durable.delete('jpdb-popup-reader-settings');
        await expect(bridge.getValue('jpdb-popup-reader-settings', null)).resolves.toBeNull();
        await expect(bridge.listValues()).resolves.not.toContain('jpdb-popup-reader-settings');
    });

    it('does not fall back to the synchronous snapshot after authoritative reads fail', async () => {
        stubGmStore(new Map([['jpdb-popup-reader-settings', { theme: 'light' }]]));
        vi.stubGlobal('GM', {
            getValue: async () => { throw new Error('durable read rejected'); },
            listValues: async () => { throw new Error('durable enumeration rejected'); },
        });
        installUserscriptGmStorageBridge();
        const bridge = getUserscriptGmStorage()!;

        await expect(bridge.getValue('jpdb-popup-reader-settings', null)).rejects.toThrow('durable read rejected');
        await expect(bridge.listValues()).rejects.toThrow('durable enumeration rejected');
    });

    it('recognizes a missing default cloned by a message-based manager', async () => {
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => structuredClone(fallback)));
        vi.stubGlobal('GM_setValue', vi.fn());
        vi.stubGlobal('GM_deleteValue', vi.fn());
        vi.stubGlobal('GM_listValues', vi.fn(() => []));
        installUserscriptGmStorageBridge();
        await expectMissingManagedValueFallback();
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

    it('never exposes private physical slots through list/get/set/delete', async () => {
        const privateLogicalKey = 'yomu:private:academy-device:v1';
        const privateSlot = `yomu:state-slot:v1:1%3Areset:${encodeURIComponent(privateLogicalKey)}`;
        const nestedPrivateSlot = `yomu:state-slot:v1:1%3Areset:${encodeURIComponent(privateSlot)}`;
        const values = new Map<string, unknown>([
            [privateSlot, 'private-secret'],
            [nestedPrivateSlot, 'nested-private-secret'],
            ['jpdb-popup-reader-settings', { theme: 'light' }],
        ]);
        stubGmStore(values);
        installUserscriptGmStorageBridge();
        const storage = getUserscriptGmStorage();
        expect(storage).toBeDefined();
        if (!storage) return;

        await expect(storage.listValues()).resolves.toEqual(['jpdb-popup-reader-settings']);
        for (const key of [privateSlot, nestedPrivateSlot]) {
            await expect(storage.getValue(key, null)).rejects.toThrow('Unmanaged storage key');
            await expect(storage.setValue(key, 'changed')).rejects.toThrow('Unmanaged storage key');
            await expect(storage.deleteValue(key)).rejects.toThrow('Unmanaged storage key');
        }
        expect(values.get(privateSlot)).toBe('private-secret');
        expect(values.get(nestedPrivateSlot)).toBe('nested-private-secret');

        await storage.clearPrivateManagedValues();
        expect(values.has(privateSlot)).toBe(false);
        // Malformed nested slots are neither exposed nor treated as valid state.
        expect(values.get(nestedPrivateSlot)).toBe('nested-private-secret');
    });

    it('installs on the yomureader.com docs origin so settings edited there reach the shared store', () => {
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/',
            hostname: 'yomureader.com',
            pathname: '/',
            origin: 'https://yomureader.com',
        });
        stubGmStore(new Map());
        installUserscriptGmStorageBridge();
        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBe('true');
        expect(getUserscriptGmStorage()).toBeDefined();
    });

    it('does not install on a non-hosted origin', () => {
        vi.stubGlobal('location', { href: 'https://jpdb.io/learn', hostname: 'jpdb.io', pathname: '/learn', origin: 'https://jpdb.io' });
        stubGmStore(new Map());
        installUserscriptGmStorageBridge();
        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBeUndefined();
        expect(getUserscriptGmStorage()).toBeUndefined();
    });
});

describe("storage bridge ownership", () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        cleanups.reverse().forEach(cleanup => cleanup());
        cleanups.length = 0;
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function install(kind: 'userscript' | 'extension', values: Map<string, unknown>, listGate?: Promise<void>) {
        vi.resetModules();
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        vi.stubGlobal('chrome', kind === 'extension' ? { runtime: { id: 'test-extension' } } : undefined);
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback);
        vi.stubGlobal('GM_setValue', (key: string, value: unknown) => { values.set(key, value); });
        vi.stubGlobal('GM_deleteValue', (key: string) => { values.delete(key); });
        vi.stubGlobal('GM_listValues', async () => { if (listGate) await listGate; return [...values.keys()]; });
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.installUserscriptGmStorageBridge();
        cleanups.push(bridge.uninstallUserscriptGmStorageBridge);
        return bridge;
    }

    it.each([true, false])('uses only extension storage with userscript-first=%s', async userscriptFirst => {
        const key = 'jpdb-popup-reader-settings';
        const userscriptStore = new Map([[key, { theme: 'light' }]]);
        const extensionStore = new Map([[key, { theme: 'dark' }]]);
        const user = userscriptFirst ? await install('userscript', userscriptStore) : undefined;
        const extension = await install('extension', extensionStore);
        const userscript = user ?? await install('userscript', userscriptStore);
        const storage = extension.getUserscriptGmStorage()!;
        await expect(storage.getValue(key, null)).resolves.toEqual({ theme: 'dark' });
        await storage.setValue(key, { theme: 'auto' });
        expect(extensionStore.get(key)).toEqual({ theme: 'auto' });
        expect(userscriptStore.get(key)).toEqual({ theme: 'light' });
        userscript.uninstallUserscriptGmStorageBridge();
        await expect(extension.getUserscriptGmStorage()!.getValue(key, null)).resolves.toEqual({ theme: 'auto' });
    });

    it('rejects an old-store read that finishes after extension takeover', async () => {
        const key = 'jpdb-popup-reader-settings';
        let finishRead!: (value: unknown) => void;
        const oldValue = new Promise(resolve => { finishRead = resolve; });
        const userscript = await install('userscript', new Map([[key, oldValue]]));
        const reading = userscript.getUserscriptGmStorage()!.getValue(key, null);
        await install('extension', new Map([[key, { theme: 'dark' }]]));
        finishRead({ theme: 'light' });
        await expect(reading).rejects.toThrow('authority changed');
    });

    it('does not retarget an existing connection after extension takeover', async () => {
        const key = 'jpdb-popup-reader-settings';
        const oldStore = new Map([[key, { theme: 'light' }]]);
        const nextStore = new Map([[key, { theme: 'dark' }]]);
        const userscript = await install('userscript', oldStore);
        const connection = userscript.getUserscriptGmStorage()!;
        await install('extension', nextStore);
        await expect(connection.setValue(key, { theme: 'auto' })).rejects.toThrow('authority changed');
        await expect(userscript.getUserscriptGmStorage()!.getValue(key, null)).rejects.toThrow('authority changed');
        expect(oldStore.get(key)).toEqual({ theme: 'light' });
        expect(nextStore.get(key)).toEqual({ theme: 'dark' });
    });

    it('keeps a disconnected page client unavailable instead of falling back to local storage', async () => {
        const server = await install('extension', new Map());
        vi.resetModules();
        const page = await import('../../src/reader/userscript/storage-bridge');
        const connection = page.getUserscriptGmStorage()!;
        server.uninstallUserscriptGmStorageBridge();
        expect(page.getUserscriptGmStorage()).toBeDefined();
        await expect(connection.setValue('jpdb-popup-reader-settings', { theme: 'dark' })).rejects.toThrow('authority changed');
    });

    it('does not issue a queued write after its responder is uninstalled', async () => {
        const key = 'yomu:srs-local:v2:card:word';
        const values = new Map<string, unknown>([[key, { reviews: 7 }]]);
        const bridge = await install('userscript', values);
        const writing = bridge.getUserscriptGmStorage()!.setValue(key, { reviews: 0 });
        bridge.uninstallUserscriptGmStorageBridge();
        await expect(writing).rejects.toThrow('authority changed');
        expect(values.get(key)).toEqual({ reviews: 7 });
    });

    it('does not delete private values after ownership changes during enumeration', async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const key = 'yomu:private:academy-device:v1';
        const values = new Map<string, unknown>([[key, { fixture: 'keep' }]]);
        const old = await install('userscript', values, gate);
        const clearing = old.getUserscriptGmStorage()!.clearPrivateManagedValues();
        await install('extension', new Map());
        release();
        await expect(clearing).rejects.toThrow('authority changed');
        expect(values.get(key)).toEqual({ fixture: 'keep' });
    });
});
