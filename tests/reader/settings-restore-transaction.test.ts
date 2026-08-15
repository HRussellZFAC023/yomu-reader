import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    beginStoredValuesImport,
    ensureManagedWebStorageCurrent,
    managedLocalStorage,
} from '../../src/reader/app/storage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings';
import { subscribeToSettingsChanges } from '../../src/reader/settings/settings-change-bus';
import { exportSettingsBackupSnapshot } from '../../src/reader/settings/settings-persistence-transaction';
import { runSettingsRestoreTransaction } from '../../src/reader/settings/settings-restore-transaction';
import {
    HOSTED_STUDY_LOCATION,
    installGmStorageFixture,
    type GmStorageFixture,
} from './helpers/settings-persistence-fixture';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_KEY = 'yomu:settings-intent:v2';
const GENERIC_KEY = 'jpdb-reader-transcript-panel-size';
const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';
const LOCAL_PROVENANCE_KEY = 'yomu:local-storage-provenance:v1';
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function stubManagedStorage(initial: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initial));
    return installGmStorageFixture(values);
}

function installTornFirstExportSamples(storage: GmStorageFixture): void {
    const reads = new Map<string, number>();
    storage.getValue.mockImplementation(async (key: string, fallback: unknown) => (
        exportSample(storage.values, reads, key, fallback)
    ));
}

function exportSample(
    values: Map<string, unknown>,
    reads: Map<string, number>,
    key: string,
    fallback: unknown,
): unknown {
    const count = (reads.get(key) ?? 0) + 1;
    reads.set(key, count);
    const torn = firstTornExportSample(key, count);
    if (torn !== undefined) return torn;
    return structuredClone(values.has(key) ? values.get(key) : fallback);
}

function firstTornExportSample(key: string, count: number): unknown {
    if (count !== 1) return undefined;
    if (key === SETTINGS_KEY) {
        return { ...DEFAULT_SETTINGS, theme: 'light', [COMMIT_FIELD]: 'older-settings-commit' };
    }
    if (key === INTENT_KEY) {
        return { revision: 1, records: {}, [COMMIT_FIELD]: 'newer-intent-commit' };
    }
    return undefined;
}

async function installHostedManagedFallback(key: string): Promise<Map<string, unknown>> {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const { values } = stubManagedStorage({ [key]: { minutes: 5 } });
    localStorage.setItem(key, JSON.stringify({ minutes: 3 }));
    await ensureManagedWebStorageCurrent();
    return values;
}

describe('settings restore durability transaction', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('never generic-writes settings authority keys and rolls back exact generic values on final publication failure', async () => {
        const previousSettings = { theme: 'light' };
        const previousIntent = { revision: 1, records: { theme: { seq: 1, value: 'light' } } };
        const { values, setValue } = stubManagedStorage({
            [SETTINGS_KEY]: previousSettings,
            [INTENT_KEY]: previousIntent,
            [GENERIC_KEY]: { width: 240 },
        });
        const importedCommit = 'backup-commit';
        const publishFailure = new Error('final settings publication failed');
        const publishSettings = vi.fn(async importedView => {
            expect(importedView).toMatchObject({
                settings: { theme: 'dark' },
                intentLedger: { records: { theme: { value: 'dark' } } },
            });
            expect(values.get(GENERIC_KEY)).toEqual({ width: 420 });
            expect(values.get(SETTINGS_KEY)).toEqual(previousSettings);
            expect(values.get(INTENT_KEY)).toEqual(previousIntent);
            throw publishFailure;
        });

        await expect(runSettingsRestoreTransaction({
            storage: {
                [SETTINGS_KEY]: { theme: 'dark', [COMMIT_FIELD]: importedCommit },
                'jpdb-reader-settings': { theme: 'legacy-dark' },
                'yomu-reader-settings': { theme: 'legacy-light' },
                'yomu-settings': { theme: 'legacy-auto' },
                [INTENT_KEY]: {
                    revision: 4,
                    records: { theme: { seq: 4, value: 'dark' } },
                    [COMMIT_FIELD]: importedCommit,
                },
                'yomu:explicit-user-settings:v1': { theme: 'dark' },
                'yomu:prefer-japanese-site-language:v1': true,
                'yomu:prefer-japanese-site-language': true,
                [GENERIC_KEY]: { width: 420 },
            },
            publishSettings,
        })).rejects.toBe(publishFailure);

        expect(values.get(GENERIC_KEY)).toEqual({ width: 240 });
        expect(values.get(SETTINGS_KEY)).toEqual(previousSettings);
        expect(values.get(INTENT_KEY)).toEqual(previousIntent);
        const writtenKeys = setValue.mock.calls.map(call => call[0]);
        expect(writtenKeys).not.toContain(SETTINGS_KEY);
        expect(writtenKeys).not.toContain(INTENT_KEY);
        expect(writtenKeys).not.toContain('jpdb-reader-settings');
        expect(writtenKeys).not.toContain('yomu-reader-settings');
        expect(writtenKeys).not.toContain('yomu-settings');
        expect(writtenKeys).not.toContain('yomu:explicit-user-settings:v1');
        expect(writtenKeys).not.toContain('yomu:prefer-japanese-site-language:v1');
        expect(writtenKeys).not.toContain('yomu:prefer-japanese-site-language');
    });

    it('rejects an imported settings half-commit before staging any generic value', async () => {
        const { values, setValue } = stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage: {
                [SETTINGS_KEY]: { theme: 'dark', [COMMIT_FIELD]: 'settings-commit' },
                [INTENT_KEY]: {
                    revision: 1,
                    records: {},
                    [COMMIT_FIELD]: 'different-intent-commit',
                },
                [GENERIC_KEY]: { width: 420 },
            },
            publishSettings,
        })).rejects.toThrow('incomplete settings persistence transaction');

        expect(values.get(GENERIC_KEY)).toEqual({ width: 240 });
        expect(setValue).not.toHaveBeenCalled();
        expect(publishSettings).not.toHaveBeenCalled();
    });

    it('re-witnesses a settings pair after a generic export samples two different commits', async () => {
        const liveCommit = 'live-settings-commit';
        const liveSettings = { ...DEFAULT_SETTINGS, theme: 'dark', [COMMIT_FIELD]: liveCommit };
        const liveIntent = {
            revision: 2,
            records: { theme: { seq: 2, value: 'dark' } },
            [COMMIT_FIELD]: liveCommit,
        };
        const storage = stubManagedStorage({
            [SETTINGS_KEY]: liveSettings,
            [INTENT_KEY]: liveIntent,
        });
        installTornFirstExportSamples(storage);

        const backup = await exportSettingsBackupSnapshot(DEFAULT_SETTINGS);
        const settings = backup.storage[SETTINGS_KEY] as Record<string, unknown>;
        const intent = backup.storage[INTENT_KEY] as Record<string, unknown>;

        expect(backup.settings.theme).toBe('dark');
        expect(settings.theme).toBe('dark');
        expect(settings[COMMIT_FIELD]).toEqual(expect.any(String));
        expect(intent[COMMIT_FIELD]).toBe(settings[COMMIT_FIELD]);
        expect(settings[COMMIT_FIELD]).not.toBe('older-settings-commit');
        expect(intent[COMMIT_FIELD]).not.toBe('newer-intent-commit');
    });

    it('rejects backup export when settings authority rejects instead of serializing fallback settings', async () => {
        const commit = 'live-settings-commit';
        const readFailure = new Error('settings authority unavailable');
        const storage = stubManagedStorage({
            [SETTINGS_KEY]: { ...DEFAULT_SETTINGS, theme: 'dark', [COMMIT_FIELD]: commit },
            [INTENT_KEY]: { revision: 2, records: {}, [COMMIT_FIELD]: commit },
        });
        storage.getValue.mockImplementation(async (key: string, fallback: unknown) => {
            if (key === SETTINGS_KEY) throw readFailure;
            return structuredClone(storage.values.has(key) ? storage.values.get(key) : fallback);
        });

        await expect(exportSettingsBackupSnapshot({ ...DEFAULT_SETTINGS, theme: 'light' }))
            .rejects.toBe(readFailure);
    });

    it.each([
        {
            name: 'a pre-transaction canonical settings value with no ledger',
            storage: { [SETTINGS_KEY]: { theme: 'dark' } },
        },
        {
            name: 'legacy settings and the preferred-site scalar only',
            storage: {
                'jpdb-reader-settings': { theme: 'dark' },
                'yomu:prefer-japanese-site-language:v1': true,
            },
        },
    ])('preserves current intent for $name', async ({ storage }) => {
        const { setValue } = stubManagedStorage();
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage,
            publishSettings,
        })).resolves.toEqual({ restoredValues: 0 });

        expect(publishSettings).toHaveBeenCalledWith(null);
        expect(setValue).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'null canonical settings and intent values',
            storage: { [SETTINGS_KEY]: null, [INTENT_KEY]: null },
        },
        {
            name: 'a primitive v2 intent value',
            storage: { [SETTINGS_KEY]: { theme: 'dark' }, [INTENT_KEY]: 'corrupt-ledger' },
        },
        {
            name: 'a mixed ledger with a malformed record',
            storage: {
                [SETTINGS_KEY]: { theme: 'dark' },
                [INTENT_KEY]: { revision: 2, records: { theme: { seq: 1, value: 'dark' }, accentColor: null } },
            },
        },
    ])('rejects $name before staging durable values', async ({ storage }) => {
        const { setValue } = stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage: { ...storage, [GENERIC_KEY]: { width: 420 } },
            publishSettings,
        })).rejects.toThrow(/malformed/);

        expect(setValue).not.toHaveBeenCalled();
        expect(publishSettings).not.toHaveBeenCalled();
    });

    it('rejects a witnessed canonical settings value whose paired ledger is absent', async () => {
        const { setValue } = stubManagedStorage();
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage: {
                [SETTINGS_KEY]: { theme: 'dark', [COMMIT_FIELD]: 'settings-commit' },
                [GENERIC_KEY]: { width: 420 },
            },
            publishSettings,
        })).rejects.toThrow('incomplete settings persistence transaction');

        expect(setValue).not.toHaveBeenCalled();
        expect(publishSettings).not.toHaveBeenCalled();
    });

    it('does not clobber a concurrent post-stage value during rollback', async () => {
        const { values } = stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const transaction = await beginStoredValuesImport({ [GENERIC_KEY]: { width: 420 } });
        values.set(GENERIC_KEY, { width: 640 });

        await expect(transaction.rollback()).rejects.toBeInstanceOf(AggregateError);

        expect(values.get(GENERIC_KEY)).toEqual({ width: 640 });
        expect(localStorage.getItem(GENERIC_KEY)).toBeNull();
    });

    it('preserves a newer raw local fallback while independently restoring staged canonical storage', async () => {
        const key = 'jpdb-reader-newtab-daily-study-time';
        const values = await installHostedManagedFallback(key);
        const transaction = await beginStoredValuesImport({ [key]: { minutes: 7 } });
        managedLocalStorage.setItem(key, JSON.stringify({ minutes: 9 }));
        const concurrentRaw = localStorage.getItem(key);
        const concurrentProvenance = localStorage.getItem(LOCAL_PROVENANCE_KEY);

        await expect(transaction.rollback()).rejects.toBeInstanceOf(AggregateError);

        expect(values.get(key)).toEqual({ minutes: 5 });
        expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({ minutes: 9 });
        expect(localStorage.getItem(key)).toBe(concurrentRaw);
        expect(localStorage.getItem(LOCAL_PROVENANCE_KEY)).toBe(concurrentProvenance);
    });

    it('rolls back a local failure fallback installed by a rejected GM write', async () => {
        const key = 'jpdb-reader-newtab-daily-study-time';
        const values = await installHostedManagedFallback(key);
        vi.stubGlobal('GM_setValue', vi.fn(async () => {
            throw new Error('authoritative write rejected');
        }));

        await expect(beginStoredValuesImport({ [key]: { minutes: 7 } }))
            .rejects.toThrow(/GM storage write failed/);

        expect(values.get(key)).toEqual({ minutes: 5 });
        expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual({ minutes: 3 });
        expect(localStorage.getItem(LOCAL_PROVENANCE_KEY)).toBeNull();
    });

    it('journals a later key after an intervening concurrent change instead of restoring an early stale snapshot', async () => {
        const firstKey = 'jpdb-reader-settings-drawer-height-ratio';
        const secondKey = GENERIC_KEY;
        const values = new Map<string, unknown>([
            [firstKey, 0.4],
            [secondKey, { width: 240 }],
        ]);
        const firstWriteStarted = deferred<void>();
        const releaseFirstWrite = deferred<void>();
        const { setValue } = installGmStorageFixture(values);
        setValue.mockImplementation(async (key: string, value: unknown) => {
            if (key === firstKey && values.get(firstKey) === 0.4) {
                firstWriteStarted.resolve();
                await releaseFirstWrite.promise;
            }
            values.set(key, structuredClone(value));
        });
        const publicationFailure = new Error('final publication failed');
        const restore = runSettingsRestoreTransaction({
            storage: {
                [firstKey]: 0.7,
                [secondKey]: { width: 420 },
            },
            publishSettings: async () => { throw publicationFailure; },
        });
        await firstWriteStarted.promise;
        values.set(secondKey, { width: 640 });
        releaseFirstWrite.resolve();

        await expect(restore).rejects.toBe(publicationFailure);

        expect(values.get(firstKey)).toBe(0.4);
        expect(values.get(secondKey)).toEqual({ width: 640 });
    });

    it('surfaces rollback failures alongside the original restore failure', async () => {
        stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const originalFailure = new Error('dictionary import failed');
        const dictionaryRollbackFailure = new Error('dictionary rollback failed');

        const restore = runSettingsRestoreTransaction({
            storage: { [GENERIC_KEY]: { width: 420 } },
            stageBeforeSettings: async () => { throw originalFailure; },
            rollbackBeforeSettings: async () => { throw dictionaryRollbackFailure; },
            publishSettings: vi.fn().mockResolvedValue(undefined),
        });

        await expect(restore).rejects.toMatchObject({
            name: 'AggregateError',
            errors: [originalFailure, dictionaryRollbackFailure],
        });
    });

    it('keeps every restore stage committed when one post-commit settings listener throws', async () => {
        const importedAccent = '#123456';
        const { values } = stubManagedStorage({
            [SETTINGS_KEY]: DEFAULT_SETTINGS,
            [GENERIC_KEY]: { width: 240 },
        });
        let dictionaryState = 'previous';
        const recordingListener = vi.fn();
        const unsubscribeThrowing = subscribeToSettingsChanges(() => {
            throw new Error('listener failed after commit');
        });
        const unsubscribeRecording = subscribeToSettingsChanges(recordingListener);
        try {
            await expect(runSettingsRestoreTransaction({
                storage: { [GENERIC_KEY]: { width: 420 } },
                stageBeforeSettings: async () => { dictionaryState = 'imported'; },
                rollbackBeforeSettings: async () => { dictionaryState = 'previous'; },
                publishSettings: async () => saveSettings({
                    ...DEFAULT_SETTINGS,
                    accentColor: importedAccent,
                }, { explicitUserChoiceKeys: ['accentColor'] }),
            })).resolves.toEqual({ restoredValues: 1 });
        } finally {
            unsubscribeRecording();
            unsubscribeThrowing();
        }

        expect(values.get(GENERIC_KEY)).toEqual({ width: 420 });
        expect(dictionaryState).toBe('imported');
        await expect(loadSettings()).resolves.toMatchObject({ accentColor: importedAccent });
        expect(recordingListener).toHaveBeenCalledWith(expect.objectContaining({
            settings: expect.objectContaining({ accentColor: importedAccent }),
        }));
    });
});
