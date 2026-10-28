import { afterEach, expect, it, vi } from 'vitest';
import { STORAGE_WORK_LEASE_MS, withGmStorageLeaseCore, type GmStorageLeaseEnvironment } from '../../src/reader/app/gm-storage-lease';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { stubWebLocks } from './helpers/browser-fixtures';

// On よむ's own site a page can run without the GM claims ("standalone") beside
// one bridged to an installed よむ. The origin's web lock is all that keeps the
// standalone writer and the bridged one apart.
const LEASE = 'reader-settings-persistence';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
});

function hostedEnvironments(): { bridged: GmStorageLeaseEnvironment<string>; standalone: GmStorageLeaseEnvironment<string> } {
    const values = new Map<string, unknown>();
    const bridged: GmStorageLeaseEnvironment<string> = {
        backend: {
            getValue: <T>(key: string, fallback: T): T => values.has(key) ? values.get(key) as T : fallback,
            setValue: (key, value) => { values.set(key, value); },
            deleteValue: key => { values.delete(key); },
            listValues: () => [...values.keys()],
        },
        captureEpoch: async () => 'current', assertMutationFence: async () => {}, epochToken: value => value,
        hostedOrigin: true,
    };
    return { bridged, standalone: { ...bridged, backend: { getValue: null, setValue: null, deleteValue: null, listValues: null } } };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

it('serializes bridged and standalone settings writers through the same origin lock', async () => {
    const names = stubWebLocks();
    const { bridged, standalone } = hostedEnvironments();
    const started = deferred();
    const hold = deferred();
    const events: string[] = [];
    const first = withGmStorageLeaseCore(LEASE, async () => {
        events.push('shared-start'); started.resolve(); await hold.promise; events.push('shared-end');
    }, {}, bridged);
    await started.promise;
    const second = withGmStorageLeaseCore(LEASE, async () => { events.push('local'); }, {}, standalone);
    try {
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(events).toEqual(['shared-start']);
    } finally { hold.resolve(); await Promise.all([first, second]); }
    expect(events).toEqual(['shared-start', 'shared-end', 'local']);
    expect(names).toEqual([`yomu:${LEASE}`, `yomu:${LEASE}`]);
});

// The standalone writer has no claims for the bridged one to queue behind, so
// the bridged writer keeps waiting at the lock past its usual one lease.
it('keeps a bridged settings writer waiting while a standalone one holds the lock longer than a lease', async () => {
    vi.useFakeTimers();
    stubWebLocks();
    const { bridged, standalone } = hostedEnvironments();
    const options = { leaseMs: STORAGE_WORK_LEASE_MS };
    const hold = deferred();
    const events: string[] = [];
    const first = withGmStorageLeaseCore(LEASE, async () => {
        events.push('local-start'); await hold.promise; events.push('local-end');
    }, options, standalone);
    await vi.advanceTimersByTimeAsync(0);
    const second = withGmStorageLeaseCore(LEASE, async () => { events.push('shared'); }, options, bridged);

    await vi.advanceTimersByTimeAsync(3 * STORAGE_WORK_LEASE_MS);
    expect(events).toEqual(['local-start']);
    hold.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);
    expect(events).toEqual(['local-start', 'local-end', 'shared']);
});

// Managed storage tells the lease which site it runs on. Elsewhere any page
// script can take よむ's web lock and keep it, so a save waits one lease at most.
it.each([
    ['on よむ\'s own site, keeps a settings save waiting for the web lock past one lease', HOSTED_STUDY_LOCATION, false],
    ['on any other site, has a settings save stop waiting for the web lock after one lease',
        { href: 'https://example.com/', hostname: 'example.com', pathname: '/', origin: 'https://example.com' }, true],
])('%s', async (_title, location, stops) => {
    vi.useFakeTimers();
    vi.stubGlobal('location', location);
    const values = new Map<string, unknown>();
    installGmStorageFixture(values);
    vi.stubGlobal('GM_listValues', () => [...values.keys()]);
    stubWebLocks();
    const held = deferred();
    void navigator.locks.request(`yomu:${LEASE}`, () => held.promise);
    const storage = await import('../../src/reader/app/storage');
    let saved = false;
    const saving = storage.withGmStorageLease(LEASE, async () => { saved = true; }, { leaseMs: STORAGE_WORK_LEASE_MS });

    await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
    expect(saved).toBe(stops);
    held.resolve();
    await vi.advanceTimersByTimeAsync(100);
    await saving;
    expect(saved).toBe(true);
});
