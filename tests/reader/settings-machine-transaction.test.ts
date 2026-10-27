import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { committedSettingsStoragePair, readBackupSettingsPersistenceView, serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { loadSettings, NO_EXPLICIT_USER_CHOICE } from "../../src/reader/settings/index";
import { HOSTED_STUDY_LOCATION, installRejectedOptionsCommit, installSizeLimitedGmStorage, saveExplicitOptions } from "./helpers/settings-persistence-fixture";
import { installFreshManagedStateEpochSessionForTests } from "../../src/reader/app/managed-state-epoch";
import { STORAGE_WORK_LEASE_MS, withGmStorageLeaseCore, type GmStorageLeaseEnvironment } from "../../src/reader/app/gm-storage-lease";
import { stubWebLocks } from "./helpers/browser-fixtures";
import { beginSettingsResetGuard, endSettingsResetGuard } from "../../src/reader/settings/index";

const commitField = '__yomuSettingsPersistenceCommitV1';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

describe('machine settings transactions', () => {
    it('creates a complete current pair on the first save without inventing user intent', async () => {
        const { values } = installGmStorageFixture();
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] });

        const settings = values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>;
        const ledger = values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY) as Record<string, unknown>;
        expect(settings[commitField]).toEqual(expect.any(String));
        expect(ledger).toEqual({ revision: 0, records: {}, [commitField]: settings[commitField] });
        await expect(readBackupSettingsPersistenceView(Object.fromEntries(values))).resolves.toMatchObject({
            settings: { theme: 'dark' }, intentLedger: { revision: 0, records: {} },
        });
    });

    it('publishes a new pair for a machine save while retaining the existing intent revision', async () => {
        const initialLedger = { revision: 1, records: { theme: { seq: 1, value: 'dark' } } };
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'dark' }, initialLedger);
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        const previousCommit = (values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>)[commitField];

        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light', accentColor: '#123456' }, { explicitUserChoiceKeys: [] });

        const settings = values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>;
        expect(settings[commitField]).not.toBe(previousCommit);
        expect(values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual({ ...initialLedger, [commitField]: settings[commitField] });
        await expect(readBackupSettingsPersistenceView(Object.fromEntries(values))).resolves.toMatchObject({
            settings: { theme: 'dark', accentColor: '#123456' }, intentLedger: initialLedger,
        });
    });

    it.each(['marker', 'ledger', 'settings'] as const)('restores the previous pair after a failed machine %s write, then permits retry', async stage => {
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
        let failed = false;
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)), {
            beforeSet: (key, value) => {
                const target = stage === 'ledger'
                    ? key === SETTINGS_INTENT_LEDGER_STORAGE_KEY
                    : key === SETTINGS_STORAGE_KEY && Object.hasOwn(value as object, '__yomuSettingsPersistenceTransactionV1') === (stage === 'marker');
                if (target && !failed) {
                    failed = true;
                    throw new Error('machine write rejected');
                }
            },
        });
        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] }))
            .rejects.toThrow();
        expect(failed).toBe(true);
        for (const [key, value] of Object.entries(pair)) expect(values.get(key)).toEqual(value);

        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] });
        await expect(readBackupSettingsPersistenceView(Object.fromEntries(values))).resolves.toMatchObject({
            settings: { theme: 'dark' }, intentLedger: { revision: 0, records: {} },
        });
    });

    it('returns both keys to absence when a first machine save fails after staging its ledger', async () => {
        let publicationRejected = false;
        let stagedLedger: unknown;
        const { values } = installGmStorageFixture(new Map(), {
            beforeSet: (key, value) => {
                if (key === SETTINGS_STORAGE_KEY && !Object.hasOwn(value as object, '__yomuSettingsPersistenceTransactionV1')) {
                    publicationRejected = true;
                    stagedLedger = values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
                    throw new Error('first settings write rejected');
                }
            },
        });
        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] })).rejects.toThrow();
        expect(publicationRejected).toBe(true);
        expect(stagedLedger).toEqual({ revision: 0, records: {}, [commitField]: expect.any(String) });
        expect(values.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(values.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
    });

    it('retains the original witness when recovery and its rollback fail again', async () => {
        const ledger = { revision: 0, records: {} };
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, ledger);
        const values = new Map(Object.entries(pair));
        const originalCommit = (pair[SETTINGS_INTENT_LEDGER_STORAGE_KEY] as Record<string, unknown>)[commitField];
        for (let attempt = 0; attempt < 2; attempt++) {
            let publicationFailures = 0;
            let rollbackFailures = 0;
            installGmStorageFixture(values, {
                beforeSet: (key, value) => {
                    if (key === SETTINGS_STORAGE_KEY && !Object.hasOwn(value as object, '__yomuSettingsPersistenceTransactionV1')) {
                        publicationFailures++;
                        throw new Error('settings publication rejected');
                    }
                    if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY && (value as Record<string, unknown>)[commitField] === originalCommit) {
                        rollbackFailures++;
                        throw new Error('ledger rollback rejected');
                    }
                },
            });
            await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] })).rejects.toThrow();
            expect(publicationFailures).toBe(1);
            expect(rollbackFailures).toBe(1);
            expect(values.get(SETTINGS_STORAGE_KEY)).toHaveProperty('__yomuSettingsPersistenceTransactionV1');
            expect(committedSettingsStoragePair(values.get(SETTINGS_STORAGE_KEY), values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)))
                .toEqual({ settings: DEFAULT_SETTINGS, intentLedger: ledger });
        }
        installGmStorageFixture(values);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] });
        await expect(readBackupSettingsPersistenceView(Object.fromEntries(values))).resolves.toMatchObject({
            settings: { theme: 'dark' }, intentLedger: ledger,
        });
    });

    it('keeps the previous pair readable until the machine settings write publishes', async () => {
        const ledger = { revision: 0, records: {} };
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, ledger);
        const values = new Map(Object.entries(pair));
        const witnessed: unknown[] = [];
        installGmStorageFixture(values, {
            beforeSet: key => {
                if (key !== SETTINGS_STORAGE_KEY && key !== SETTINGS_INTENT_LEDGER_STORAGE_KEY) return;
                witnessed.push(committedSettingsStoragePair(values.get(SETTINGS_STORAGE_KEY), values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)));
            },
        });

        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] });

        expect(witnessed).toHaveLength(3);
        for (const view of witnessed) expect(view).toEqual({ settings: DEFAULT_SETTINGS, intentLedger: ledger });
        expect(committedSettingsStoragePair(values.get(SETTINGS_STORAGE_KEY), values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)))
            .toMatchObject({ settings: { theme: 'dark' }, intentLedger: ledger });
    });
});

describe('interrupted settings persistence recovery', () => {
    function isFinalChosenSettingsWrite(key: string, value: unknown): boolean {
        if (key !== SETTINGS_STORAGE_KEY) return false;
        const settings = value as Record<string, unknown>;
        if (settings.enableLogging !== true) return false;
        return !Object.hasOwn(settings, '__yomuSettingsPersistenceTransactionV1');
    }

    function expectRolledBackSettings(
        store: Map<string, unknown>,
        canonical: unknown,
        local: unknown,
        ledger: unknown,
    ): void {
        expect(store.get(SETTINGS_STORAGE_KEY)).toEqual(canonical);
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual(ledger);
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')).toEqual(local);
    }


    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('cleans a staged ledger behind its marker before a later machine save publishes', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const { previousSettings, previousPair: pair, store, storage } = installRejectedOptionsCommit();
        storage.setValue.mockImplementation(async (key: string, value: unknown) => {
            if (isFinalChosenSettingsWrite(key, value)) throw new Error('settings blob rejected');
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY
                && JSON.stringify(value) === JSON.stringify(pair[key])) throw new Error('ledger rollback rejected');
            store.set(key, structuredClone(value));
        });

        await expect(saveExplicitOptions(previousSettings)).rejects.toThrow(/rollback operation/);

        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            enableLogging: false,
            __yomuSettingsPersistenceTransactionV1: { version: 1 },
        });
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            records: { enableLogging: { value: true } },
        });

        installGmStorageFixture(store);
        const machineSettings = { ...previousSettings, theme: 'dark' as const };
        await saveSettings(machineSettings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });

        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({ revision: 0, records: {} });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            theme: 'dark',
            enableLogging: false,
        });
        expect(store.get(SETTINGS_STORAGE_KEY)).not.toHaveProperty('__yomuSettingsPersistenceTransactionV1');
        await expect(loadSettings()).resolves.toMatchObject({
            theme: 'dark',
            enableLogging: false,
            manualScanEnabled: false,
        });
    });

    it('preserves a newer hosted raw fallback when an authoritative settings commit rolls back', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
            accentColor: '#654321',
        };
        const concurrentSettings = { ...previousSettings, accentColor: '#abcdef' };
        const pair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
        const store = new Map<string, unknown>(Object.entries(pair));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(previousSettings));
        const { setValue } = installGmStorageFixture(store);
        let concurrentProvenance: unknown = null;
        setValue.mockImplementation(async (key: string, value: unknown) => {
            if (isFinalChosenSettingsWrite(key, value)) {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(concurrentSettings));
                concurrentProvenance = localStorage.getItem('yomu:local-storage-provenance:v1');
                throw new Error('settings blob rejected');
            }
            store.set(key, structuredClone(value));
        });

        await expect(saveExplicitOptions(previousSettings)).rejects.toBeInstanceOf(AggregateError);

        expectRolledBackSettings(store, pair[SETTINGS_STORAGE_KEY], concurrentSettings, pair[SETTINGS_INTENT_LEDGER_STORAGE_KEY]);
        expect(localStorage.getItem('yomu:local-storage-provenance:v1')).toEqual(concurrentProvenance);
    });

    it('never embeds a forged hosted page blob in the privileged transaction marker', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const store = new Map<string, unknown>(Object.entries(
            serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} }),
        ));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            enableLogging: true,
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
            enableLogging: false,
            manualScanEnabled: false,
        };
        const pair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
        const store = new Map<string, unknown>(Object.entries(pair));
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(previousSettings));
        const nativeSetItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key === 'yomu:local-storage-provenance:v1') throw new Error('provenance write rejected');
            nativeSetItem.call(this, key, value);
        });
        const { setValue } = installGmStorageFixture(store);
        setValue.mockImplementation(async (key: string, value: unknown) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY
                && JSON.stringify(value) !== JSON.stringify(pair[key])) throw new Error('ledger rejected');
            store.set(key, structuredClone(value));
        });

        await expect(saveExplicitOptions(previousSettings)).rejects.toThrow(/ledger rejected/);

        expectRolledBackSettings(store, pair[SETTINGS_STORAGE_KEY], previousSettings, pair[SETTINGS_INTENT_LEDGER_STORAGE_KEY]);
        expect(localStorage.getItem('yomu:local-storage-provenance:v1')).toBeNull();
    });
});

describe('standalone first settings save', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });



    it('does not write to shared authority when a machine save has no pending choices', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: [] });
        const shared = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, { revision: 0, records: {} });
        const fixture = installGmStorageFixture(new Map(Object.entries(shared)));
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'light' });
        expect(fixture.setValue.mock.calls.filter(([key]) => key === SETTINGS_STORAGE_KEY || key === SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual([]);
    });

    it('keeps current values of already-declared containers when a machine adds records', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const first = { name: 'A', alias: 'A', enabled: true, priority: 1, type: 'terms' as const };
        const second = { ...first, name: 'B', alias: 'B', priority: 2 };
        await saveSettings({ ...DEFAULT_SETTINGS, dictionaryPreferences: [first] }, { explicitUserChoiceKeys: ['dictionaryPreferences'] });
        const settings = await loadSettings();
        await saveSettings({ ...settings, dictionaryPreferences: [...settings.dictionaryPreferences, second] }, { explicitUserChoiceKeys: [] });
        const record = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
        expect((await loadSettings()).dictionaryPreferences).toEqual(record.dictionaryPreferences);
        expect(record.dictionaryPreferences.map((item: { name: string }) => item.name)).toContain('B');
    });

    it('rolls back an existing offline pair exactly when the next ledger write fails', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const beforeSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const beforeLedger = localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
        const original = Storage.prototype.setItem;
        let rejected = false;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
            if (!rejected && key === SETTINGS_INTENT_LEDGER_STORAGE_KEY) {
                rejected = true;
                throw new Error('Ledger rejected');
            }
            return original.call(this, key, value);
        });
        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] })).rejects.toThrow();
        expect(rejected).toBe(true);
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(beforeSettings);
        expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(beforeLedger);
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
    });

    it('retains declared local choices across machine writes and clears withdrawn intent', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const read = () => Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)!).records).map(([key, record]) => [key, (record as { value: unknown }).value]));
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        expect(read()).toEqual({ theme: 'dark' });
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', popupMode: 'popover' }, { explicitUserChoiceKeys: [] });
        expect(read()).toEqual({ theme: 'dark' });
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', interfaceLanguage: 'ja' }, { explicitUserChoiceKeys: ['interfaceLanguage'] });
        expect(read()).toEqual({ theme: 'dark', interfaceLanguage: 'ja' });
        await saveSettings({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' }, {
            explicitUserChoiceKeys: [], clearExplicitUserChoiceKeys: ['theme'],
        });
        expect(read()).toEqual({ interfaceLanguage: 'ja' });
    });

    it('does not seed raw defaults before the transaction and returns to absence on failure', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const original = Storage.prototype.setItem;
        const published: Record<string, unknown>[] = [];
        let failed = false;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
            if (key === SETTINGS_STORAGE_KEY) {
                const record = JSON.parse(value);
                published.push(record);
                if (!failed && record.theme === 'dark' && !record.__yomuSettingsPersistenceTransactionV1) {
                    failed = true;
                    throw new Error('First save rejected');
                }
            }
            return original.call(this, key, value);
        });
        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] })).rejects.toThrow();
        expect(failed).toBe(true);
        expect(published[0]).toHaveProperty('__yomuSettingsPersistenceTransactionV1');
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
    });
});

describe("settings store isolation", () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); vi.resetModules(); });

    it('keeps standalone settings separate when installed storage becomes available', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const local = [SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY].map(key => localStorage.getItem(key));
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, {
            revision: 1, records: { theme: { seq: 1, value: 'light' } },
        });
        const { values, setValue, deleteValue } = installGmStorageFixture(new Map(Object.entries(pair)));
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'light' });
        expect(Object.fromEntries(values)).toEqual(pair);
        expect(setValue).not.toHaveBeenCalled();
        expect(deleteValue).not.toHaveBeenCalled();
        expect([SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY].map(key => localStorage.getItem(key))).toEqual(local);
    });

    it('reports unavailable installed storage instead of adopting standalone settings', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const before = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const { getValue, setValue } = installGmStorageFixture();
        getValue.mockRejectedValue(new Error('installed storage unavailable'));
        await expect(loadSettings()).rejects.toThrow('installed storage unavailable');
        expect(setValue).not.toHaveBeenCalled();
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(before);
    });

    it('saves to installed storage without overwriting standalone settings', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const keys = [SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY];
        const before = keys.map(key => localStorage.getItem(key));
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, { revision: 0, records: {} });
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        await saveSettings({ ...await loadSettings(), theme: 'auto' }, { explicitUserChoiceKeys: ['theme'] });
        expect(values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'auto' });
        expect(keys.map(key => localStorage.getItem(key))).toEqual(before);
    });

    it('does not purge standalone data when a freshly connected installation has a newer reset epoch', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const keys = [SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY];
        const before = keys.map(key => localStorage.getItem(key));
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        installGmStorageFixture(new Map([['yomu:state-epoch', {
            version: 1, generation: 2, resetId: 'independent-installed-reset', committedAt: 1000,
        }]]));
        const freshStorage = await import('../../src/reader/app/storage');
        await freshStorage.ensureManagedWebStorageCurrent();
        expect(keys.map(key => localStorage.getItem(key))).toEqual(before);
    });

    it('resets installed values and, as v1.9.3 did, every Yomu record this site kept', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const learnerKey = 'yomu:srs-local:v1';
        localStorage.setItem(learnerKey, JSON.stringify({ version: 1, cards: { retained: { expression: '読む', reviews: 7 } } }));
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, { revision: 0, records: {} });
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        vi.stubGlobal('GM_listValues', async () => [...values.keys()]);
        const storage = await import('../../src/reader/app/storage');
        await storage.ensureManagedWebStorageCurrent();
        storage.managedLocalStorage.setItem('yomu-ocr-cache-v2', JSON.stringify({ disposable: true }));
        const otherCache = 'yomu:web-owner:v2:extension:yomu-ocr-cache-v2';
        localStorage.setItem(otherCache, 'another-owner');
        localStorage.setItem('foreign-site-token', 'keep');
        const listCaches = vi.fn(async () => ['yomu-website-cache']);
        vi.stubGlobal('caches', { keys: listCaches, delete: vi.fn(async () => true) });
        await storage.clearManagedStoredValues();
        expect(values.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(values.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
        for (const key of [SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY, learnerKey, otherCache]) {
            expect(localStorage.getItem(key)).toBeNull();
        }
        expect(localStorage.getItem('foreign-site-token')).toBe('keep');
        expect(listCaches).toHaveBeenCalled();
        await expect(storage.managedStoredKeysStillPresent()).resolves.toEqual([]);
        await storage.commitManagedStateResetEpoch('installed-only-reset');
        // The website's own reset counter is never overwritten by the installation's.
        expect(localStorage.getItem('yomu:state-epoch')).toBeNull();
    });
});

describe("settings mixed backend lock", () => {
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
});

describe('settings reset guard', () => {
    afterEach(() => {
        endSettingsResetGuard();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('rejects a save during reset instead of reporting a skipped write as successful', async () => {
        const stored = { ...DEFAULT_SETTINGS, theme: 'light' as const };
        const values = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, stored]]);
        const setValue = vi.fn((key: string, value: unknown) => {
            values.set(key, value);
        });
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) =>
            values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', setValue);
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            values.delete(key);
        }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));

        beginSettingsResetGuard();
        await expect(saveSettings({ ...stored, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        })).rejects.toMatchObject({
            message: '',
        });

        expect(setValue).not.toHaveBeenCalled();
        expect(values.get(SETTINGS_STORAGE_KEY)).toBe(stored);
    });
});
