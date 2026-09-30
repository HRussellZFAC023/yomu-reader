import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    beginStoredValuesImport,
    ensureManagedWebStorageCurrent,
} from '../../src/reader/app/storage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings';
import { subscribeToSettingsChanges } from '../../src/reader/settings/settings-change-bus';
import { exportSettingsBackupSnapshot } from '../../src/reader/settings/settings-backup';
import { readBackupSettingsPersistenceView } from '../../src/reader/settings/settings-persistence-transaction';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { runSettingsRestoreTransaction } from '../../src/reader/settings/settings-restore-transaction';
import {
    HOSTED_STUDY_LOCATION,
    installGmStorageFixture,
    type GmStorageFixture,
} from './helpers/settings-persistence-fixture';
import { v193BackupFile } from './helpers/upgrade-v193-corpus';

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

    it('round-trips a current file through export, restore, durable intent and reload', async () => {
        const storage = stubManagedStorage();
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', accentColor: '#123456' }, {
            explicitUserChoiceKeys: ['theme', 'accentColor'],
        });
        const backup = await exportSettingsBackupSnapshot(await loadSettings());
        const text = JSON.stringify({ formatName: 'yomu-reader-settings', formatVersion: 3, ...backup });
        const file = new File([text], 'current-settings.json', { type: 'application/json' });
        Object.defineProperty(file, 'text', { value: async () => text });
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light', accentColor: '#654321' }, {
            explicitUserChoiceKeys: ['theme', 'accentColor'],
        });
        const adoptSettings = vi.fn();
        await restoreReaderSettingsBackup(file, await loadSettings(), {
            persistSettings: saveSettings,
            adoptSettings,
            setStatus: vi.fn(),
            dictionaryStateChanged: vi.fn(),
            dictionaries: {
                exportJson: vi.fn(), importFile: vi.fn(),
                summary: vi.fn().mockResolvedValue({ dictionaries: [] }),
            },
        });

        expect(adoptSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', accentColor: '#123456' }));
        expect(await loadSettings()).toMatchObject({ theme: 'dark', accentColor: '#123456' });
        const persisted = await readBackupSettingsPersistenceView(Object.fromEntries(storage.values));
        expect(persisted?.intentLedger.records).toMatchObject({
            theme: { value: 'dark' }, accentColor: { value: '#123456' },
        });
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

    it('exports the current settings model without resurrecting retired fields or their intent', async () => {
        const retired = { newTabEnabled: false, uchisenEnabled: true, uchisenAlias: 'Old source', uchisenPriority: 17 };
        const commit = 'old-but-witnessed';
        const originalSettings = { ...DEFAULT_SETTINGS, ...retired, theme: 'dark', newTabSource: 'dictionary', [COMMIT_FIELD]: commit };
        const originalIntent = {
            revision: 12,
            records: {
                theme: { seq: 12, value: 'dark' },
                ...Object.fromEntries(Object.entries(retired).map(([key, value]) => [key, { seq: 5, value }])),
            },
            [COMMIT_FIELD]: commit,
        };
        const oldPins = { ...retired, accentColor: '#123456' };
        const storage = stubManagedStorage({
            [SETTINGS_KEY]: originalSettings,
            [INTENT_KEY]: originalIntent,
            'yomu:explicit-user-settings:v1': oldPins,
            [GENERIC_KEY]: { width: 420 },
        });

        const backup = await exportSettingsBackupSnapshot(DEFAULT_SETTINGS);
        const settings = backup.storage[SETTINGS_KEY] as Record<string, unknown>;
        const intent = backup.storage[INTENT_KEY] as { records: Record<string, unknown>; revision: number; [COMMIT_FIELD]: string };
        for (const key of Object.keys(retired)) {
            expect(backup.settings).not.toHaveProperty(key);
            expect(settings).not.toHaveProperty(key);
            expect(intent.records).not.toHaveProperty(key);
        }
        expect(backup.settings).toMatchObject({ theme: 'dark', newTabSource: 'dictionary', accentColor: DEFAULT_SETTINGS.accentColor });
        expect(settings).toEqual({ ...backup.settings, [COMMIT_FIELD]: intent[COMMIT_FIELD] });
        expect(intent).toMatchObject({ revision: 12, records: { theme: { seq: 12, value: 'dark' } } });
        expect(intent[COMMIT_FIELD]).toEqual(expect.any(String));
        expect(intent[COMMIT_FIELD]).not.toBe(commit);
        expect(backup.storage[GENERIC_KEY]).toEqual({ width: 420 });
        const roundTrip = await readBackupSettingsPersistenceView(backup.storage);
        expect(roundTrip?.settings).toEqual(backup.settings);
        expect(roundTrip?.intentLedger.records).toEqual({ theme: { seq: 12, value: 'dark' } });
        expect(backup.storage).not.toHaveProperty('yomu:explicit-user-settings:v1');
        expect(storage.values.get(SETTINGS_KEY)).toEqual(originalSettings);
        expect(storage.values.get(INTENT_KEY)).toEqual(originalIntent);
        expect(storage.values.get('yomu:explicit-user-settings:v1')).toEqual(oldPins);
        expect(storage.setValue).not.toHaveBeenCalled();
    });

    it('exports the witnessed declared choice rather than a carried-along scalar', async () => {
        const commit = 'declared-choice';
        const originalSettings = { ...DEFAULT_SETTINGS, theme: 'light', [COMMIT_FIELD]: commit };
        const originalIntent = { revision: 4, records: { theme: { seq: 4, value: 'dark' } }, [COMMIT_FIELD]: commit };
        const storage = stubManagedStorage({ [SETTINGS_KEY]: originalSettings, [INTENT_KEY]: originalIntent });

        const backup = await exportSettingsBackupSnapshot(DEFAULT_SETTINGS);

        expect(backup.settings.theme).toBe('dark');
        expect(backup.storage[SETTINGS_KEY]).toMatchObject({ theme: 'dark' });
        expect(backup.storage[INTENT_KEY]).toMatchObject({ revision: 4, records: { theme: { seq: 4, value: 'dark' } } });
        expect(storage.values.get(SETTINGS_KEY)).toEqual(originalSettings);
        expect(storage.values.get(INTENT_KEY)).toEqual(originalIntent);
        expect(storage.setValue).not.toHaveBeenCalled();
    });

    it('normalizes and detaches the standalone fallback without inventing a storage witness', async () => {
        const recoveryPins = { theme: 'dark', newTabEnabled: true };
        const storage = stubManagedStorage({ 'yomu:explicit-user-settings:v1': recoveryPins });
        const fallback = structuredClone({ ...DEFAULT_SETTINGS, newTabEnabled: true, uchisenEnabled: true });
        const backup = await exportSettingsBackupSnapshot(fallback);

        expect(backup.settings).not.toHaveProperty('newTabEnabled');
        expect(backup.settings).not.toHaveProperty('uchisenEnabled');
        expect(backup.storage).not.toHaveProperty(SETTINGS_KEY);
        expect(backup.storage).not.toHaveProperty(INTENT_KEY);
        expect(backup.storage).not.toHaveProperty('yomu:explicit-user-settings:v1');
        expect(backup.settings.shortcuts).not.toBe(fallback.shortcuts);
        expect(backup.settings.dictionaryPreferences).not.toBe(fallback.dictionaryPreferences);
        expect(fallback.newTabEnabled).toBe(true);
        expect(storage.values.get('yomu:explicit-user-settings:v1')).toEqual(recoveryPins);
        expect(storage.setValue).not.toHaveBeenCalled();
    });

    it('does not invent imported intent when a backup contains no authority keys', async () => {
        const { setValue } = stubManagedStorage();
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage: {},
            publishSettings,
        })).resolves.toEqual({ restoredValues: 0 });

        expect(publishSettings).toHaveBeenCalledWith(null);
        expect(setValue).not.toHaveBeenCalled();
    });

    it('restores a v3 backup whose unmarked settings predate the intent ledger', async () => {
        const { values } = stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await expect(runSettingsRestoreTransaction({
            storage: { [SETTINGS_KEY]: { theme: 'dark' }, [GENERIC_KEY]: { width: 420 } },
            publishSettings,
        })).resolves.toEqual({ restoredValues: 1 });

        expect(publishSettings).toHaveBeenCalledWith({ settings: { theme: 'dark' }, intentLedger: { revision: 0, records: {} } });
        expect(values.get(GENERIC_KEY)).toEqual({ width: 420 });
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

    it.each([
        { records: {} },
        { revision: -1, records: {} },
        { revision: 0.5, records: {} },
        { revision: Number.MAX_SAFE_INTEGER + 1, records: {} },
        { revision: 1, records: { theme: { value: 'dark' } } },
        { revision: 1, records: { theme: { seq: -1, value: 'dark' } } },
    ])('rejects malformed sequenced intent before any restore writes: %j', async ledger => {
        const { setValue } = stubManagedStorage({ [GENERIC_KEY]: { width: 240 } });
        const publishSettings = vi.fn();
        await expect(runSettingsRestoreTransaction({
            storage: {
                [SETTINGS_KEY]: { theme: 'dark', [COMMIT_FIELD]: 'backup' },
                [INTENT_KEY]: { ...ledger, [COMMIT_FIELD]: 'backup' },
                [GENERIC_KEY]: { width: 420 },
            },
            publishSettings,
        })).rejects.toMatchObject({ yomuUiCopyKey: 'settingsImportIncomplete' });
        expect(setValue).not.toHaveBeenCalled();
        expect(publishSettings).not.toHaveBeenCalled();
    });

    it('restores the seq-0 ledger records a v1.9.3 backup carries without writing its retired key', async () => {
        const { setValue } = stubManagedStorage();
        const backup = v193BackupFile() as { storage: Record<string, unknown> };
        const publishSettings = vi.fn().mockResolvedValue(undefined);

        await runSettingsRestoreTransaction({ storage: backup.storage, publishSettings });

        expect(backup.storage).toHaveProperty('yomu:explicit-user-settings:v1');
        expect(setValue.mock.calls.map(([key]) => key)).not.toContain('yomu:explicit-user-settings:v1');
        expect(setValue.mock.calls.map(([key]) => key)).toContain('yomu-dictionary-archives');

        expect(publishSettings).toHaveBeenCalledWith(expect.objectContaining({
            intentLedger: expect.objectContaining({
                revision: 2,
                records: expect.objectContaining({ theme: { seq: 0, value: 'dark' }, interfaceLanguage: { seq: 2, value: 'ja' } }),
            }),
        }));
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
        // A website-only tab on the same origin writes the raw page-local value;
        // this realm's managed facade is owner-prefixed and never touches it.
        localStorage.setItem(key, JSON.stringify({ minutes: 9 }));
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
