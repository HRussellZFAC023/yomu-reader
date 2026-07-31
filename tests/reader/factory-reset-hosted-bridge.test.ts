import { afterEach, describe, expect, it, vi } from 'vitest';

const HOSTED_LOCATION = {
    href: 'https://yomureader.com/study/',
    hostname: 'yomureader.com',
    pathname: '/study/',
    origin: 'https://yomureader.com',
};

describe('hosted factory reset through the userscript storage bridge', () => {
    afterEach(async () => {
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.uninstallUserscriptGmStorageBridge();
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('clears private and public managed values without exposing private keys to page world', async () => {
        const epoch = { version: 1, generation: 1, resetId: 'previous-reset', committedAt: 1_000 };
        const settingsSlot = physicalSlot('jpdb-popup-reader-settings', epoch);
        const privateSlot = physicalSlot('yomu:private:academy-device:v1', epoch);
        const values = new Map<string, unknown>([
            ['yomu:state-epoch', epoch],
            [settingsSlot, envelope({ theme: 'dark' }, epoch)],
            [privateSlot, envelope({ credential: 'secret' }, epoch)],
        ]);
        vi.stubGlobal('location', HOSTED_LOCATION);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.installUserscriptGmStorageBridge();
        const pageStorage = bridge.getUserscriptGmStorage();
        expect(pageStorage).toBeDefined();
        if (!pageStorage) return;
        await expect(pageStorage.listValues()).resolves.toEqual(['yomu:state-epoch', settingsSlot]);

        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
        vi.stubGlobal('GM_deleteValue', undefined);
        vi.stubGlobal('GM_listValues', undefined);
        const { installFreshManagedStateEpochSessionForTests } = await import('../../src/reader/app/managed-state-epoch');
        installFreshManagedStateEpochSessionForTests();
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.clearManagedStoredValues()).resolves.toBeGreaterThan(0);
        await expect(storage.managedStoredKeysStillPresent()).resolves.toEqual([]);
        expect(values).toEqual(new Map([['yomu:state-epoch', epoch]]));
        await expect(pageStorage.getValue(privateSlot, null)).rejects.toThrow('Unmanaged storage key');
    });

    it('does not clear private values before the public inventory proves complete', async () => {
        const values = new Map<string, unknown>([
            ['yomu:private:academy-device:v1', { credential: 'keep-on-failure' }],
            ['jpdb-popup-reader-settings', { theme: 'dark' }],
        ]);
        vi.stubGlobal('location', HOSTED_LOCATION);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
        vi.stubGlobal('GM_listValues', undefined);
        const bridge = await import('../../src/reader/userscript/storage-bridge');
        bridge.installUserscriptGmStorageBridge();
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
        vi.stubGlobal('GM_deleteValue', undefined);
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.clearManagedStoredValues()).rejects.toMatchObject({ name: 'ManagedStateResetError' });
        expect(values.get('yomu:private:academy-device:v1')).toEqual({ credential: 'keep-on-failure' });
        expect(values.get('jpdb-popup-reader-settings')).toEqual({ theme: 'dark' });
    });
});

function physicalSlot(key: string, epoch: { generation: number; resetId: string }): string {
    return `yomu:state-slot:v1:${encodeURIComponent(`${epoch.generation}:${epoch.resetId}`)}:${encodeURIComponent(key)}`;
}

function envelope(value: unknown, epoch: { generation: number; resetId: string }): unknown {
    return { __yomuManagedStateEnvelope: 1, epoch: `${epoch.generation}:${epoch.resetId}`, value };
}
