// @vitest-environment node
import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Production build script.
import { hardenExtensionBackgroundSource } from '../../scripts/lib/extension-runtime-hardening.mjs';
import { compilerStorageBackgroundFixture } from './helpers/compiler-storage-background';

type Listener = (message: unknown, sender: unknown, respond: (response: unknown) => void) => unknown;
const KEY = 'usc_storage_test_preference';
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function background() {
    const listeners: Listener[] = [];
    const values: Record<string, unknown> = { [KEY]: 'before' };
    const storage = {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next); }),
        remove: vi.fn(async (key: string) => { delete values[key]; }),
    };
    const tabs = {
        query: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
        sendMessage: vi.fn((_id: number, _message: unknown): Promise<unknown> => Promise.resolve()),
    };
    const root = { browser: { runtime: { onMessage: { addListener: (listener: Listener) => listeners.push(listener) } }, storage: { local: storage }, tabs } };
    new Function('globalThis', hardenExtensionBackgroundSource(compilerStorageBackgroundFixture()))(root);
    const invoke = (type: string, value?: string) => new Promise<unknown>(resolve => {
        expect(listeners[0]!({ channel: 'userscript-compiler', type, payload: { name: 'preference', value } }, { tab: { id: 1 } }, resolve)).toBe(true);
    });
    return { values, storage, tabs, invoke };
}

describe('compiler storage notification acknowledgements', () => {
    it.each(['GM_setValue', 'GM_deleteValue'])('acknowledges %s after dispatch without waiting for a recipient reply', async type => {
        const host = background();
        const stalled = deferred<void>();
        host.tabs.sendMessage.mockImplementation(id => id === 2 ? stalled.promise : Promise.resolve());
        const reply = vi.fn();
        const mutation = host.invoke(type, 'after').then(reply);
        await nextTurn();
        try {
            expect(host.values[KEY]).toBe(type === 'GM_setValue' ? 'after' : undefined);
            expect(host.tabs.sendMessage.mock.calls.map(([id]) => id)).toEqual([1, 2]);
            expect(reply).toHaveBeenCalledWith({});
        } finally {
            stalled.resolve();
            await mutation;
        }
    });

    it.each(['GM_setValue', 'GM_deleteValue'])('does not turn failed tab discovery into a failed %s', async type => {
        const host = background();
        host.tabs.query.mockRejectedValue(new Error('tabs unavailable'));
        await expect(host.invoke(type, 'after')).resolves.toEqual({});
        expect(host.values[KEY]).toBe(type === 'GM_setValue' ? 'after' : undefined);
    });

    it.each(['throw', 'reject'] as const)('continues dispatch after one recipient %ss', async failure => {
        const host = background();
        host.tabs.sendMessage.mockImplementation(id => {
            if (id !== 1) return Promise.resolve();
            if (failure === 'throw') throw new Error('tab closed');
            return Promise.reject(new Error('tab closed'));
        });
        await expect(host.invoke('GM_setValue', 'after')).resolves.toEqual({});
        expect(host.tabs.sendMessage.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    });

    it.each(['GM_setValue', 'GM_deleteValue'])('still rejects a failed physical %s without dispatching a change', async type => {
        const host = background();
        if (type === 'GM_setValue') host.storage.set.mockRejectedValue(new Error('storage rejected'));
        else host.storage.remove.mockRejectedValue(new Error('storage rejected'));
        await expect(host.invoke(type, 'after')).resolves.toEqual({ error: 'storage rejected' });
        expect(host.values[KEY]).toBe('before');
        expect(host.tabs.query).not.toHaveBeenCalled();
        expect(host.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('dispatches each awaited mutation before the next mutation can overtake it', async () => {
        const host = background();
        const discovery = deferred<Array<{ id: number }>>();
        host.tabs.query.mockReturnValueOnce(discovery.promise);
        const reply = vi.fn();
        const first = host.invoke('GM_setValue', 'first').then(reply);
        await nextTurn();
        expect(reply).not.toHaveBeenCalled();
        discovery.resolve([{ id: 1 }, { id: 2 }]);
        await first;
        expect(host.tabs.sendMessage).toHaveBeenCalledTimes(2);
        await host.invoke('GM_setValue', 'second');
        await host.invoke('GM_deleteValue');
        expect(host.tabs.sendMessage.mock.calls.map(([id, message]) => [id, (message as { payload: unknown }).payload]))
            .toEqual([
                [1, { name: 'preference', oldValue: 'before', newValue: 'first' }],
                [2, { name: 'preference', oldValue: 'before', newValue: 'first' }],
                [1, { name: 'preference', oldValue: 'first', newValue: 'second' }],
                [2, { name: 'preference', oldValue: 'first', newValue: 'second' }],
                [1, { name: 'preference', oldValue: 'second', newValue: undefined }],
                [2, { name: 'preference', oldValue: 'second', newValue: undefined }],
            ]);
    });
});
