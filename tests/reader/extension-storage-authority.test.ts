import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asyncGmGetValue, asyncGmListValues, asyncGmSetValue, asyncGmDeleteValue } from '../../src/reader/app/gm-storage-adapters';
import { withGmStorageLeaseCore, withManagedStateEpochControlLeaseCore, type GmStorageLeaseBackend } from '../../src/reader/app/gm-storage-lease';
import { generatedCompilerStorageSource } from './helpers/compiler-storage-runtime';
// @ts-expect-error Production packaging script.
import { hardenCompilerDurableStorage } from '../../scripts/lib/extension-runtime-hardening.mjs';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

async function realm(values: Map<string, unknown>) {
    const calls: string[] = [];
    const root: Record<string, unknown> = { browser: { runtime: { sendMessage: async ({ type, payload }: { type: string; payload: Record<string, unknown> }) => {
        calls.push(type);
        const key = String(payload.name ?? '');
        if (type === 'GM_getAllValues') return { values: Object.fromEntries(values) };
        if (type === 'GM_getValue') return { value: structuredClone(values.has(key) ? values.get(key) : payload.defaultValue) };
        if (type === 'GM_listValues') return { keys: [...values.keys()] };
        if (type === 'GM_setValue') values.set(key, structuredClone(payload.value));
        if (type === 'GM_deleteValue') values.delete(key);
        return {};
    } } } };
    new Function('globalThis', hardenCompilerDurableStorage(generatedCompilerStorageSource()))(root);
    await root.__USC_READY;
    for (const key of ['GM', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues']) vi.stubGlobal(key, root[key]);
    const backend: GmStorageLeaseBackend = { getValue: asyncGmGetValue(), setValue: asyncGmSetValue(), deleteValue: asyncGmDeleteValue(), listValues: asyncGmListValues() };
    return { root, backend, calls };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('extension authoritative storage reads', () => {
    it('does not treat hydration or missed notifications as durable authority', async () => {
        const values = new Map<string, unknown>([['preference', 'old']]);
        const tab = await realm(values);
        values.set('preference', 'new');
        values.set('another-tab-claim', 'held');
        expect(await tab.backend.getValue!('preference', null)).toBe('new');
        expect(await tab.backend.listValues!()).toContain('another-tab-claim');
        values.delete('preference');
        expect(await tab.backend.getValue!('preference', 'absent')).toBe('absent');
        expect(await tab.backend.listValues!()).not.toContain('preference');
        expect(tab.calls).toContain('GM_getValue');
        expect(tab.calls).toContain('GM_listValues');
    });

    it.each(['settings', 'epoch'] as const)('excludes a second %s lease even with all notifications withheld', async kind => {
        const values = new Map<string, unknown>();
        const a = await realm(values);
        const b = await realm(values);
        const entered = deferred<void>();
        const release = deferred<void>();
        const secondEntered = vi.fn();
        const lease = (backend: GmStorageLeaseBackend, operation: () => Promise<void>) => kind === 'epoch'
            ? withManagedStateEpochControlLeaseCore(operation, { backend })
            : withGmStorageLeaseCore('reader-settings-persistence', operation, { pollMs: 1 }, {
                backend, captureEpoch: async () => 1, assertMutationFence: async () => undefined, epochToken: String,
            });
        const first = lease(a.backend, async () => { entered.resolve(); await release.promise; });
        await entered.promise;
        const second = lease(b.backend, async () => { secondEntered(); });
        await nextTurn();
        await nextTurn();
        try { expect(secondEntered).not.toHaveBeenCalled(); }
        finally { release.resolve(); await Promise.all([first, second]); }
        expect(secondEntered).toHaveBeenCalledOnce();
        expect(values.size).toBe(0);
    });
});
