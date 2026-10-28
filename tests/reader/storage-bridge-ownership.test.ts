import { afterEach, expect, it, vi } from 'vitest';

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
