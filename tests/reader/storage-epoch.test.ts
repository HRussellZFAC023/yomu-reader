import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const EPOCH_KEY = 'yomu:state-epoch';
const SIGNAL_KEY = 'yomu:factory-reset-signal';
const SLOT_PREFIX = 'yomu:state-slot:v1:';
const EPOCH_LEASE_PREFIX = 'yomu:state-epoch-lease:v1:';
const PRIVATE_KEY = 'yomu:private:academy-device:v1';
const SYNC_KEY = 'jpdb-reader-newtab-ui';

interface EpochRecord {
    version: 1;
    generation: number;
    resetId: string;
    committedAt: number;
}

function epoch(generation: number, resetId: string): EpochRecord {
    return { version: 1, generation, resetId, committedAt: generation * 1_000 };
}

function slotKey(key: string, value: EpochRecord): string {
    const token = `${value.generation}:${value.resetId}`;
    return `${SLOT_PREFIX}${encodeURIComponent(token)}:${encodeURIComponent(key)}`;
}

function envelope(value: unknown, stateEpoch: EpochRecord): unknown {
    return {
        __yomuManagedStateEnvelope: 1,
        epoch: `${stateEpoch.generation}:${stateEpoch.resetId}`,
        value,
    };
}

function installGmStore(
    values: Map<string, unknown>,
    setValue: (key: string, value: unknown) => void | Promise<void> = (key, value) => { values.set(key, value); },
): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn(setValue));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
}

afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('managed storage epoch boundary', () => {
    it('does not recreate a transaction fallback after factory-reset deletion starts', async () => {
        const registry = await import('../../src/reader/app/managed-state-registry');
        const storage = await import('../../src/reader/app/storage');
        registry.beginManagedStateReset();
        localStorage.removeItem(SETTINGS_KEY);
        try {
            storage.restoreLocalFallbackStoredValue(SETTINGS_KEY, { learningTargetChosen: true }, true);
            expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
        } finally {
            registry.endManagedStateReset();
        }
    });

    it('stores and reads only matching post-reset envelopes across async, private, and sync APIs', async () => {
        const currentEpoch = epoch(1, 'reset-one');
        const values = new Map<string, unknown>([[EPOCH_KEY, currentEpoch]]);
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');

        await storage.gmStorageSet(SETTINGS_KEY, { theme: 'dark' });
        await storage.gmPrivateStorageSet(PRIVATE_KEY, { credential: 'secret' });
        storage.gmStorageSetSync(SYNC_KEY, { mode: 'kanji' });

        expect(values.has(SETTINGS_KEY)).toBe(false);
        expect(values.get(slotKey(SETTINGS_KEY, currentEpoch))).toMatchObject({
            __yomuManagedStateEnvelope: 1,
            epoch: '1:reset-one',
            value: { theme: 'dark' },
        });
        expect(values.get(slotKey(PRIVATE_KEY, currentEpoch))).toMatchObject({ value: { credential: 'secret' } });
        expect(values.get(slotKey(SYNC_KEY, currentEpoch))).toMatchObject({ value: { mode: 'kanji' } });
        expect(await storage.gmStorageGet(SETTINGS_KEY, null)).toEqual({ theme: 'dark' });
        expect(await storage.gmPrivateStorageGet(PRIVATE_KEY, null)).toEqual({ credential: 'secret' });
        expect(storage.gmStorageGetSync(SYNC_KEY, null)).toEqual({ mode: 'kanji' });

        values.set(SETTINGS_KEY, { theme: 'stale-raw-value' });
        expect(await storage.gmStorageGet(SETTINGS_KEY, null)).toEqual({ theme: 'dark' });

        storage.gmStorageDeleteSync(SYNC_KEY);
        expect(values.get(slotKey(SYNC_KEY, currentEpoch))).toMatchObject({
            epoch: '1:reset-one',
            value: { __yomuStorageValueMissing: true },
        });
        expect(storage.gmStorageGetSync(SYNC_KEY, null)).toBeNull();
    });

    it('keeps generation zero on the exact legacy logical key and raw value format', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');

        await storage.gmStorageSet(SETTINGS_KEY, { theme: 'legacy-dark' });

        expect(values.get(SETTINGS_KEY)).toEqual({ theme: 'legacy-dark' });
        expect([...values.keys()].some(key => key.startsWith(SLOT_PREFIX))).toBe(false);
    });

    it('never treats an unprovenanced page-local settings byte as shared learner intent', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            subtitleFontSize: 48,
            learningTargetChosen: true,
        }));
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.gmStorageGetShared(SETTINGS_KEY, null)).resolves.toBeNull();
        expect(storage.gmStorageGetSharedSync(SETTINGS_KEY, null)).toBeNull();
        expect(values.has(SETTINGS_KEY)).toBe(false);
    });

    it('rejects a delayed old-realm write and makes its late payload unreadable after reboot', async () => {
        const values = new Map<string, unknown>();
        let releaseWrite!: () => void;
        let markWriteStarted!: () => void;
        const writeStarted = new Promise<void>(resolve => { markWriteStarted = resolve; });
        const release = new Promise<void>(resolve => { releaseWrite = resolve; });
        installGmStore(values, async (key, value) => {
            if (key === SETTINGS_KEY) {
                markWriteStarted();
                await release;
            }
            values.set(key, value);
        });

        const oldRealm = await import('../../src/reader/app/storage');
        expect(await oldRealm.gmStorageGet(SETTINGS_KEY, null)).toBeNull();
        const lateWrite = oldRealm.gmStorageSet(SETTINGS_KEY, { theme: 'stale-dark' });
        await writeStarted;

        const freshEpoch = epoch(1, 'factory-reset');
        values.set(EPOCH_KEY, freshEpoch);
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const freshRealm = await import('../../src/reader/app/storage');
        await freshRealm.gmStorageSet(SETTINGS_KEY, { theme: 'fresh-light' });
        releaseWrite();

        await expect(lateWrite).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
        expect(values.get(SETTINGS_KEY)).toEqual({ theme: 'stale-dark' });
        expect(values.get(slotKey(SETTINGS_KEY, freshEpoch))).toMatchObject({ value: { theme: 'fresh-light' } });
        await expect(freshRealm.gmStorageGet(SETTINGS_KEY, null)).resolves.toEqual({ theme: 'fresh-light' });

        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebootedRealm = await import('../../src/reader/app/storage');
        expect(await rebootedRealm.gmStorageGet(SETTINGS_KEY, null)).toEqual({ theme: 'fresh-light' });
    });

    it('rejects a delayed generation-zero delete without deleting a fresh generation-one slot', async () => {
        const values = new Map<string, unknown>([[SETTINGS_KEY, { theme: 'legacy-dark' }]]);
        let releaseDelete!: () => void;
        let markDeleteStarted!: () => void;
        const deleteStarted = new Promise<void>(resolve => { markDeleteStarted = resolve; });
        const release = new Promise<void>(resolve => { releaseDelete = resolve; });
        installGmStore(values);
        vi.stubGlobal('GM_deleteValue', vi.fn(async (key: string) => {
            if (key === SETTINGS_KEY) {
                markDeleteStarted();
                await release;
            }
            values.delete(key);
        }));

        const oldRealm = await import('../../src/reader/app/storage');
        expect(await oldRealm.gmStorageGet(SETTINGS_KEY, null)).toEqual({ theme: 'legacy-dark' });
        const lateDelete = oldRealm.gmStorageDelete(SETTINGS_KEY);
        await deleteStarted;

        const freshEpoch = epoch(1, 'factory-reset');
        values.set(EPOCH_KEY, freshEpoch);
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const freshRealm = await import('../../src/reader/app/storage');
        await freshRealm.gmStorageSet(SETTINGS_KEY, { theme: 'fresh-light' });
        releaseDelete();

        await expect(lateDelete).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
        expect(values.has(SETTINGS_KEY)).toBe(false);
        expect(values.get(slotKey(SETTINGS_KEY, freshEpoch))).toMatchObject({ value: { theme: 'fresh-light' } });
        await expect(freshRealm.gmStorageGet(SETTINGS_KEY, null)).resolves.toEqual({ theme: 'fresh-light' });
    });

    it('keeps a standalone reset local when no shared backend exists', async () => {
        const offlineStorage = await import('../../src/reader/app/storage');
        await offlineStorage.commitManagedStateResetEpoch('offline-reset');

        expect(JSON.parse(localStorage.getItem(EPOCH_KEY) ?? 'null')).toMatchObject({
            generation: 1,
            resetId: 'offline-reset',
        });
    });

    it.each([
        ['higher generation', epoch(999, 'host-page-poison')],
        ['conflicting reset id', epoch(1, 'host-page-conflict')],
    ])('never lets a %s page-local epoch outrank shared storage', async (_label, localEpoch) => {
        const sharedEpoch = epoch(1, 'shared-reset');
        const values = new Map<string, unknown>([
            [EPOCH_KEY, sharedEpoch],
            [slotKey(SETTINGS_KEY, sharedEpoch), envelope({ theme: 'shared-light' }, sharedEpoch)],
        ]);
        const setValue = vi.fn((key: string, value: unknown) => { values.set(key, value); });
        installGmStore(values, setValue);
        localStorage.setItem(EPOCH_KEY, JSON.stringify(localEpoch));
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.gmStorageGet(SETTINGS_KEY, null)).resolves.toEqual({ theme: 'shared-light' });
        expect(values.get(EPOCH_KEY)).toEqual(sharedEpoch);
        expect(setValue).not.toHaveBeenCalledWith(EPOCH_KEY, expect.anything());
        expect(JSON.parse(localStorage.getItem(EPOCH_KEY) ?? 'null')).toEqual(sharedEpoch);
    });

    it('does not promote an unprovenanced hosted mirror after reset', async () => {
        const values = new Map<string, unknown>([[EPOCH_KEY, epoch(1, 'factory-reset')]]);
        installGmStore(values);
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/newtab/',
            origin: 'https://yomureader.com',
            hostname: 'yomureader.com',
            pathname: '/newtab/',
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }));
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();
        expect(values.has(SETTINGS_KEY)).toBe(false);
    });

    it('does not promote an unprovenanced non-hosted fallback after reset', async () => {
        const values = new Map<string, unknown>([[EPOCH_KEY, epoch(1, 'factory-reset')]]);
        installGmStore(values);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=reset-proof',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/watch',
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'stale-dark' }));
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();
        expect(values.has(SETTINGS_KEY)).toBe(false);
    });

    it('re-reads the authoritative current slot when a stale logical-key listener event arrives', async () => {
        const currentEpoch = epoch(1, 'factory-reset');
        const values = new Map<string, unknown>([[EPOCH_KEY, currentEpoch]]);
        const listeners = new Map<string, (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void>();
        installGmStore(values);
        vi.stubGlobal('GM_addValueChangeListener', vi.fn((
            key: string,
            listener: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
        ) => {
            listeners.set(key, listener);
            return listeners.size;
        }));
        vi.stubGlobal('GM_removeValueChangeListener', vi.fn());
        const storage = await import('../../src/reader/app/storage');
        await storage.gmStorageSet(SETTINGS_KEY, { theme: 'fresh-light' });

        let resolveNotification!: (value: unknown) => void;
        const notification = new Promise<unknown>(resolve => { resolveNotification = resolve; });
        const unsubscribe = storage.subscribeToStoredValueChanges(SETTINGS_KEY, resolveNotification);
        expect(listeners.has(SETTINGS_KEY)).toBe(true);
        expect(listeners.has(slotKey(SETTINGS_KEY, currentEpoch))).toBe(true);

        listeners.get(SETTINGS_KEY)?.(SETTINGS_KEY, { theme: 'legacy' }, undefined, true);

        await expect(notification).resolves.toEqual({ theme: 'fresh-light' });
        unsubscribe();
    });

    it('treats a current-slot tombstone as authoritative over a provenanced local mirror', async () => {
        const currentEpoch = epoch(1, 'factory-reset');
        const values = new Map<string, unknown>([[EPOCH_KEY, currentEpoch]]);
        const setValue = vi.fn((key: string, value: unknown) => { values.set(key, value); });
        installGmStore(values, setValue);
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/newtab/',
            origin: 'https://yomureader.com',
            hostname: 'yomureader.com',
            pathname: '/newtab/',
        });
        const storage = await import('../../src/reader/app/storage');
        await storage.gmStorageSet(SETTINGS_KEY, { theme: 'fresh-light' });
        const localMirror = localStorage.getItem(SETTINGS_KEY);
        const provenance = localStorage.getItem('yomu:local-storage-provenance:v1');
        expect(localMirror).not.toBeNull();
        expect(provenance).not.toBeNull();

        await storage.gmStorageDelete(SETTINGS_KEY);
        localStorage.setItem(SETTINGS_KEY, localMirror as string);
        localStorage.setItem('yomu:local-storage-provenance:v1', provenance as string);
        const writesBeforeRead = setValue.mock.calls.length;

        await expect(storage.gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();
        expect(storage.gmStorageGetSync(SETTINGS_KEY, null)).toBeNull();
        expect(storage.gmStorageGetSharedSync(SETTINGS_KEY, null)).toBeNull();
        await expect(storage.storedValueExists(SETTINGS_KEY)).resolves.toBe(false);
        expect(setValue).toHaveBeenCalledTimes(writesBeforeRead);
        expect(values.get(slotKey(SETTINGS_KEY, currentEpoch))).toMatchObject({
            value: { __yomuStorageValueMissing: true },
        });

        const registry = await import('../../src/reader/app/managed-state-registry');
        registry.beginManagedStateReset();
        try {
            await storage.gmStorageDelete(SETTINGS_KEY);
        } finally {
            registry.endManagedStateReset();
        }
        expect(values.has(slotKey(SETTINGS_KEY, currentEpoch))).toBe(false);
        expect(values.has(SETTINGS_KEY)).toBe(false);
    });

    it('rejects local bytes overwritten after their current-epoch provenance was recorded', async () => {
        localStorage.setItem(EPOCH_KEY, JSON.stringify(epoch(1, 'factory-reset')));
        const storage = await import('../../src/reader/app/storage');
        await storage.gmStorageSet(SETTINGS_KEY, { theme: 'current-light' });

        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'stale-dark' }));

        await expect(storage.gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();
        expect(storage.localFallbackStoredValue(SETTINGS_KEY, null)).toBeNull();
    });

    it('purges old local bytes before a hosted mirror write can fail', async () => {
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/newtab/',
            origin: 'https://yomureader.com',
            hostname: 'yomureader.com',
            pathname: '/newtab/',
        });
        const legacyStorage = await import('../../src/reader/app/storage');
        await legacyStorage.gmStorageSet(SETTINGS_KEY, { theme: 'legacy-dark' });

        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const values = new Map<string, unknown>([[EPOCH_KEY, epoch(1, 'factory-reset')]]);
        installGmStore(values);
        const originalSetItem = Storage.prototype.setItem;
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string): void {
            if (key === SETTINGS_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            originalSetItem.call(this, key, value);
        });
        const rebootedStorage = await import('../../src/reader/app/storage');

        await rebootedStorage.ensureManagedWebStorageCurrent();
        await expect(rebootedStorage.gmStorageSet(SETTINGS_KEY, { theme: 'current-light' })).resolves.toBeUndefined();
        setItem.mockRestore();

        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
        expect(localStorage.getItem('yomu:local-storage-provenance:v1')).toBeNull();
    });

    it('still promotes a matching post-reset hosted edit after the bridge returns', async () => {
        const values = new Map<string, unknown>([[EPOCH_KEY, epoch(1, 'factory-reset')]]);
        installGmStore(values);
        vi.stubGlobal('location', {
            href: 'https://yomureader.com/newtab/',
            origin: 'https://yomureader.com',
            hostname: 'yomureader.com',
            pathname: '/newtab/',
        });
        const storage = await import('../../src/reader/app/storage');
        await storage.gmStorageGet(SETTINGS_KEY, null);

        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
        vi.stubGlobal('GM_deleteValue', undefined);
        vi.stubGlobal('GM_listValues', undefined);
        const baseline = { theme: 'light', lookupOnHover: true };
        await storage.gmStorageGet(SETTINGS_KEY, baseline);
        await storage.gmStorageSet(SETTINGS_KEY, { ...baseline, theme: 'dark' });

        installGmStore(values);
        await expect(storage.gmStorageGet(SETTINGS_KEY, baseline)).resolves.toEqual({ theme: 'dark' });
        expect(values.get(slotKey(SETTINGS_KEY, epoch(1, 'factory-reset')))).toMatchObject({
            __yomuManagedStateEnvelope: 1,
            epoch: '1:factory-reset',
            value: { theme: 'dark' },
        });
    });

    it('keeps raw reset controls out of backups and ordinary reset deletion', async () => {
        const currentEpoch = epoch(1, 'factory-reset');
        const futureEpoch = epoch(2, 'future-reset');
        const epochLeaseKey = `${EPOCH_LEASE_PREFIX}active-reset-owner`;
        const values = new Map<string, unknown>([
            [EPOCH_KEY, currentEpoch],
            [SIGNAL_KEY, { id: 'factory-reset', phase: 'prepare', at: 1, href: 'https://example.com/' }],
            [epochLeaseKey, { version: 1, owner: 'active-reset-owner' }],
            [slotKey(SETTINGS_KEY, currentEpoch), envelope({ theme: 'dark' }, currentEpoch)],
            [slotKey(SETTINGS_KEY, futureEpoch), envelope({ theme: 'future-stale' }, futureEpoch)],
            [slotKey(PRIVATE_KEY, currentEpoch), envelope({ credential: 'secret' }, currentEpoch)],
        ]);
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.exportManagedStoredValues()).resolves.toEqual({
            [SETTINGS_KEY]: { theme: 'dark' },
        });
        await storage.clearManagedStoredValues();

        expect(values).toEqual(new Map<string, unknown>([
            [EPOCH_KEY, currentEpoch],
            [SIGNAL_KEY, { id: 'factory-reset', phase: 'prepare', at: 1, href: 'https://example.com/' }],
            [epochLeaseKey, { version: 1, owner: 'active-reset-owner' }],
        ]));
    });

    it('projects post-reset localStorage slots into backups while excluding session state', async () => {
        const currentEpoch = epoch(1, 'factory-reset');
        const values = new Map<string, unknown>([[EPOCH_KEY, currentEpoch]]);
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');
        await storage.ensureManagedWebStorageCurrent();
        storage.managedLocalStorage.setItem('yomu-ocr-cache-v2', JSON.stringify({ fresh: true }));
        storage.managedSessionStorage.setItem('yomu:jps', JSON.stringify(['tab-only']));

        const backup = await storage.exportManagedStoredValues();
        expect(backup).toEqual({
            'yomu-ocr-cache-v2': { fresh: true },
        });
        expect(Object.keys(backup).some(key => key.startsWith('yomu:web-storage-slot:v1:'))).toBe(false);
    });

    it('fails closed without GM listing, then clears logical and physical E1 state before an E2 commit', async () => {
        const currentEpoch = epoch(1, 'first-reset');
        const srsIndexKey = 'yomu:srs-local:v2:index';
        const srsCardKey = 'yomu:srs-local:v2:card:slot-card';
        const archiveIndexKey = 'yomu-dictionary-archives';
        const archiveChunkKey = 'yomu-dictionary-archive:slot-dictionary:0';
        const values = new Map<string, unknown>([
            [EPOCH_KEY, currentEpoch],
            [SETTINGS_KEY, { theme: 'legacy-compatibility-copy' }],
            [slotKey(SETTINGS_KEY, currentEpoch), envelope({ theme: 'current-light' }, currentEpoch)],
            [slotKey(srsIndexKey, currentEpoch), envelope({
                version: 2,
                revision: 1,
                cardIds: ['slot-card'],
                tombstoneIds: [],
            }, currentEpoch)],
            [slotKey(srsCardKey, currentEpoch), envelope({ spelling: '読む' }, currentEpoch)],
            [slotKey(archiveIndexKey, currentEpoch), envelope({
                'slot-dictionary': { title: 'Slot Dictionary', filename: 'slot.zip', size: 4, chunkCount: 1 },
            }, currentEpoch)],
            [slotKey(archiveChunkKey, currentEpoch), envelope('bytes', currentEpoch)],
        ]);
        installGmStore(values);
        vi.stubGlobal('GM_listValues', undefined);
        const storage = await import('../../src/reader/app/storage');
        const { enumerateLocalYomuSrsStorageKeys } = await import('../../src/reader/srs/local-yomu-store');

        await expect(enumerateLocalYomuSrsStorageKeys()).resolves.toEqual([srsIndexKey, srsCardKey]);
        const beforeFailedReset = new Map(values);
        await expect(storage.clearManagedStoredValues()).rejects.toMatchObject({
            name: 'ManagedStateResetError',
            yomuUiCopyKey: 'factoryResetStorageIncomplete',
        });
        expect(values).toEqual(beforeFailedReset);

        installGmStore(values);
        await storage.clearManagedStoredValues();
        expect(values).toEqual(new Map([[EPOCH_KEY, currentEpoch]]));

        await expect(storage.commitManagedStateResetEpoch('second-reset')).resolves.toMatchObject({
            generation: 2,
            resetId: 'second-reset',
        });
        expect(values.get(EPOCH_KEY)).toMatchObject({ generation: 2, resetId: 'second-reset' });
        expect([...values.keys()].some(key => key.startsWith(SLOT_PREFIX))).toBe(false);
    });

    it('enumerates and deletes child keys named by an old-epoch SRS index', async () => {
        const values = new Map<string, unknown>([
            [EPOCH_KEY, epoch(2, 'current-reset')],
            ['yomu:srs-local:v2:index', {
                __yomuManagedStateEnvelope: 1,
                epoch: '1:old-reset',
                value: { version: 2, revision: 1, cardIds: ['stale-child'], tombstoneIds: [] },
            }],
            ['yomu:srs-local:v2:card:stale-child', {
                __yomuManagedStateEnvelope: 1,
                epoch: '1:old-reset',
                value: { spelling: '読む' },
            }],
        ]);
        installGmStore(values);
        vi.stubGlobal('GM_listValues', undefined);
        const { enumerateLocalYomuSrsStorageKeys } = await import('../../src/reader/srs/local-yomu-store');

        await expect(enumerateLocalYomuSrsStorageKeys()).resolves.toEqual([
            'yomu:srs-local:v2:index',
            'yomu:srs-local:v2:card:stale-child',
        ]);
    });

    it('fails before deletion when the durable epoch is malformed', async () => {
        const values = new Map<string, unknown>([
            [EPOCH_KEY, { version: 1, generation: 1 }],
            [SETTINGS_KEY, { theme: 'dark' }],
        ]);
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');

        await expect(storage.clearManagedStoredValues()).rejects.toMatchObject({
            name: 'ManagedStateResetError',
            yomuUiCopyKey: 'factoryResetStorageIncomplete',
        });
        expect(values.has(SETTINGS_KEY)).toBe(true);
    });

    it('does not acquire a raw GM lease while reset writes are suppressed', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');
        const registry = await import('../../src/reader/app/managed-state-registry');
        const operation = vi.fn(async () => 'done');
        registry.beginManagedStateReset();
        try {
            await expect(storage.withGmStorageLease('reset-fence', operation, { leaseMs: 1_000 }))
                .rejects.toThrow('suppressed');
        } finally {
            registry.endManagedStateReset();
        }
        expect(operation).not.toHaveBeenCalled();
        expect([...values.keys()].filter(key => key.startsWith('yomu:lease:'))).toEqual([]);
    });

    it('uses the durable prepare signal to fence an unsignalled lease realm', async () => {
        const values = new Map<string, unknown>([[SIGNAL_KEY, {
            id: 'remote-reset', phase: 'prepare', at: 1, href: 'https://example.com/',
        }]]);
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');
        const operation = vi.fn(async () => 'done');

        await expect(storage.withGmStorageLease('reset-fence', operation, { leaseMs: 1_000 }))
            .rejects.toThrow('suppressed');

        expect(operation).not.toHaveBeenCalled();
        expect([...values.keys()].filter(key => key.startsWith('yomu:lease:'))).toEqual([]);
    });

    it('does not let stale lease release delete a replacement claim', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const storage = await import('../../src/reader/app/storage');
        let releaseOperation!: () => void;
        const operationGate = new Promise<void>(resolve => { releaseOperation = resolve; });
        let markOperationStarted!: () => void;
        const operationStarted = new Promise<void>(resolve => { markOperationStarted = resolve; });
        const lease = storage.withGmStorageLease('replacement-proof', async () => {
            markOperationStarted();
            await operationGate;
            return 'done';
        }, { leaseMs: 1_000 });
        await operationStarted;
        const key = [...values.keys()].find(candidate => candidate.startsWith('yomu:lease:replacement-proof:'))!;
        const replacement = { ...(values.get(key) as Record<string, unknown>), claimId: 'replacement-claim' };
        values.set(key, replacement);
        releaseOperation();

        await expect(lease).rejects.toThrow('ownership was lost');
        expect(values.get(key)).toEqual(replacement);
    });

    it('rolls back a delayed lease renewal that lands after the reset sweep', async () => {
        vi.useFakeTimers();
        const values = new Map<string, unknown>();
        let claimWrites = 0;
        let releaseRenewal!: () => void;
        const renewalGate = new Promise<void>(resolve => { releaseRenewal = resolve; });
        let markRenewalStarted!: () => void;
        const renewalStarted = new Promise<void>(resolve => { markRenewalStarted = resolve; });
        installGmStore(values, async (key, value) => {
            if (key.startsWith('yomu:lease:')) {
                claimWrites++;
                if (claimWrites === 3) {
                    markRenewalStarted();
                    await renewalGate;
                }
            }
            values.set(key, value);
        });
        const storage = await import('../../src/reader/app/storage');
        let releaseOperation!: () => void;
        const operationGate = new Promise<void>(resolve => { releaseOperation = resolve; });
        let markOperationStarted!: () => void;
        const operationStarted = new Promise<void>(resolve => { markOperationStarted = resolve; });
        const lease = storage.withGmStorageLease('renewal-proof', async () => {
            markOperationStarted();
            await operationGate;
            return 'done';
        }, { leaseMs: 1_000 });
        await operationStarted;

        await vi.advanceTimersByTimeAsync(334);
        await renewalStarted;
        values.set(SIGNAL_KEY, { id: 'remote-reset', phase: 'prepare', at: Date.now(), href: 'https://example.com/' });
        for (const key of [...values.keys()]) if (key.startsWith('yomu:lease:')) values.delete(key);
        releaseRenewal();
        releaseOperation();

        await expect(lease).rejects.toThrow('suppressed');
        expect([...values.keys()].filter(key => key.startsWith('yomu:lease:'))).toEqual([]);
    });

    it('does not resolve a lease operation while its pending renewal can still reject', async () => {
        vi.useFakeTimers();
        const values = new Map<string, unknown>();
        let claimWrites = 0;
        let rejectRenewal!: () => void;
        const renewalGate = new Promise<void>((_resolve, reject) => {
            rejectRenewal = () => reject(new Error('renewal rejected'));
        });
        let markRenewalStarted!: () => void;
        const renewalStarted = new Promise<void>(resolve => { markRenewalStarted = resolve; });
        installGmStore(values, async (key, value) => {
            if (key.startsWith('yomu:lease:') && ++claimWrites === 3) {
                markRenewalStarted();
                await renewalGate;
            }
            values.set(key, value);
        });
        const storage = await import('../../src/reader/app/storage');
        let releaseOperation!: () => void;
        const operationGate = new Promise<void>(resolve => { releaseOperation = resolve; });
        const lease = storage.withGmStorageLease('pending-renewal-proof', async () => {
            await operationGate;
            return 'done';
        }, { leaseMs: 1_000 });
        await vi.advanceTimersByTimeAsync(334);
        await renewalStarted;

        releaseOperation();
        await Promise.resolve();
        let settled = false;
        void lease.then(
            () => { settled = true; },
            () => { settled = true; },
        );
        await Promise.resolve();
        expect(settled).toBe(false);

        rejectRenewal();
        await expect(lease).rejects.toThrow();
        expect([...values.keys()].filter(key => key.startsWith('yomu:lease:'))).toEqual([]);
    });
});
