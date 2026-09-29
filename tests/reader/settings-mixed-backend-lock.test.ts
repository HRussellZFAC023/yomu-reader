import { afterEach, expect, it, vi } from 'vitest';
import { withGmStorageLeaseCore, type GmStorageLeaseEnvironment } from '../../src/reader/app/gm-storage-lease';

afterEach(() => { vi.unstubAllGlobals(); });

it('serializes bridged and standalone settings writers through the same origin lock', async () => {
    let tail = Promise.resolve();
    const names: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: <T>(name: string, callback: () => Promise<T>) => {
        names.push(name);
        const next = tail.then(callback);
        tail = next.then(() => undefined, () => undefined);
        return next;
    } } });
    const values = new Map<string, unknown>();
    const shared: GmStorageLeaseEnvironment<string> = {
        backend: {
            getValue: <T>(key: string, fallback: T): T => values.has(key) ? values.get(key) as T : fallback,
            setValue: (key, value) => { values.set(key, value); },
            deleteValue: key => { values.delete(key); },
            listValues: () => [...values.keys()],
        },
        captureEpoch: async () => 'current', assertMutationFence: async () => {}, epochToken: value => value,
    };
    const standalone = { ...shared, backend: { getValue: null, setValue: null, deleteValue: null, listValues: null } };
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const events: string[] = [];
    const first = withGmStorageLeaseCore('reader-settings-persistence', async () => {
        events.push('shared-start'); entered(); await hold; events.push('shared-end');
    }, {}, shared);
    await started;
    const second = withGmStorageLeaseCore('reader-settings-persistence', async () => { events.push('local'); }, {}, standalone);
    try {
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(events).toEqual(['shared-start']);
    } finally { release(); await Promise.all([first, second]); }
    expect(events).toEqual(['shared-start', 'shared-end', 'local']);
    expect(names).toEqual(['yomu:reader-settings-persistence', 'yomu:reader-settings-persistence']);
});
