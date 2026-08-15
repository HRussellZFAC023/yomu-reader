import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_SETTINGS,
    loadSettings,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/index';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import {
    HOSTED_STUDY_LOCATION,
    installGmStorageFixture,
    installRejectedTargetCommit,
    installSizeLimitedGmStorage,
    saveChosenTarget,
} from './helpers/settings-persistence-fixture';

function isFinalChosenSettingsWrite(key: string, value: unknown): boolean {
    if (key !== SETTINGS_STORAGE_KEY) return false;
    const settings = value as Record<string, unknown>;
    if (settings.learningTargetChosen !== true) return false;
    return !Object.hasOwn(settings, '__yomuSettingsPersistenceTransactionV1');
}

function expectRolledBackSettings(
    store: Map<string, unknown>,
    canonical: unknown,
    local: unknown,
): void {
    expect(store.get(SETTINGS_STORAGE_KEY)).toEqual(canonical);
    expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')).toEqual(local);
}

describe('interrupted settings persistence recovery', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('cleans a staged ledger behind its marker before a later machine save publishes', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const { previousSettings, store, storage } = installRejectedTargetCommit();
        storage.deleteValue.mockImplementation(async (key: string) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY) throw new Error('ledger rollback rejected');
            store.delete(key);
        });

        await expect(saveChosenTarget(previousSettings)).rejects.toThrow(/rollback operation/);

        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            learningTargetChosen: false,
            __yomuSettingsPersistenceTransactionV1: { version: 1 },
        });
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            records: { learningTargetChosen: { value: true } },
        });

        installGmStorageFixture(store);
        const machineSettings = { ...previousSettings, theme: 'dark' as const };
        await saveSettings(machineSettings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });

        expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            theme: 'dark',
            learningTargetChosen: false,
        });
        expect(store.get(SETTINGS_STORAGE_KEY)).not.toHaveProperty('__yomuSettingsPersistenceTransactionV1');
        await expect(loadSettings()).resolves.toMatchObject({
            theme: 'dark',
            learningTargetChosen: false,
            onboardingSeen: false,
        });
    });

    it('preserves a newer hosted raw fallback when an authoritative settings commit rolls back', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
            accentColor: '#654321',
        };
        const concurrentSettings = { ...previousSettings, accentColor: '#abcdef' };
        const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, previousSettings]]);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(previousSettings));
        const { setValue } = installGmStorageFixture(store);
        let concurrentProvenance: unknown = null;
        setValue.mockImplementation(async (key: string, value: unknown) => {
            if (isFinalChosenSettingsWrite(key, value)) {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(concurrentSettings));
                concurrentProvenance = JSON.parse(
                    localStorage.getItem('yomu:local-storage-provenance:v1') ?? 'null',
                ).values[SETTINGS_STORAGE_KEY];
                throw new Error('settings blob rejected');
            }
            store.set(key, structuredClone(value));
        });

        await expect(saveChosenTarget(previousSettings)).rejects.toBeInstanceOf(AggregateError);

        expectRolledBackSettings(store, previousSettings, concurrentSettings);
        expect(JSON.parse(localStorage.getItem('yomu:local-storage-provenance:v1') ?? 'null')
            .values[SETTINGS_STORAGE_KEY]).toEqual(concurrentProvenance);
    });

    it('never embeds a forged hosted page blob in the privileged transaction marker', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS]]);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            learningTargetChosen: true,
            pagePayload: 'x'.repeat(500_000),
        }));
        const { writes } = installSizeLimitedGmStorage(store, 200_000);

        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        })).resolves.toBeUndefined();

        expect(writes.length).toBeGreaterThan(0);
        expect(JSON.stringify(writes)).not.toContain('pagePayload');
    });

    it('recognizes a transaction-owned raw marker when its provenance write fails', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, previousSettings]]);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(previousSettings));
        const nativeSetItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key === 'yomu:local-storage-provenance:v1') throw new Error('provenance write rejected');
            nativeSetItem.call(this, key, value);
        });
        const { setValue } = installGmStorageFixture(store);
        setValue.mockImplementation(async (key: string, value: unknown) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY) throw new Error('ledger rejected');
            store.set(key, structuredClone(value));
        });

        await expect(saveChosenTarget(previousSettings)).rejects.toThrow(/ledger rejected/);

        expectRolledBackSettings(store, previousSettings, previousSettings);
        expect(localStorage.getItem('yomu:local-storage-provenance:v1')).toBeNull();
    });
});
