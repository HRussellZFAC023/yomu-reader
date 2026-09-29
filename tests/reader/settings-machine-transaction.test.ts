import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { committedSettingsStoragePair, readBackupSettingsPersistenceView, serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

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
