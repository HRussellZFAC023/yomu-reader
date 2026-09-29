import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveHostedAppearance } from '../../src/reader/settings/hosted-appearance-settings';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { readBackupSettingsPersistenceView, serializeSettingsPersistencePair, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/settings-persistence-transaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('standalone appearance transaction', () => {
    it('advances declared intent and preserves unrelated settings', async () => {
        const initial = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light', subtitleFontSize: 48 }, {
            revision: 7, records: { theme: { seq: 7, value: 'light' } },
        });
        const { values } = installGmStorageFixture(new Map(Object.entries(initial)));
        await saveHostedAppearance({ key: 'theme', value: 'dark' });
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark', subtitleFontSize: 48 },
            intentLedger: { revision: 8, records: { theme: { value: 'dark', seq: 8 } } },
        });
        expect(values.get(SETTINGS_STORAGE_KEY)).not.toEqual(initial[SETTINGS_STORAGE_KEY]);
    });

    it('serializes concurrent theme and language choices into one witnessed authority', async () => {
        const { values } = installGmStorageFixture();
        await Promise.all([
            saveHostedAppearance({ key: 'theme', value: 'dark' }),
            saveHostedAppearance({ key: 'interfaceLanguage', value: 'ja' }),
        ]);
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark', interfaceLanguage: 'ja', learningTargetChosen: false },
            intentLedger: { revision: 2, records: {
                theme: { value: 'dark' }, interfaceLanguage: { value: 'ja' },
            } },
        });
    });

    it.each([
        { key: 'apiKey', value: 'unwanted' },
        { key: 'theme', value: 'blue' },
        { key: 'interfaceLanguage', value: 'invalid' },
        { key: 'theme', value: 'dark', apiKey: 'unwanted' },
        null,
    ])('rejects an invalid shell request without storage writes (%j)', async choice => {
        const { setValue } = installGmStorageFixture();
        await expect(saveHostedAppearance(choice as never)).rejects.toThrow('Invalid appearance choice');
        expect(setValue).not.toHaveBeenCalled();
    });

    it('rejects a failed publication and preserves the prior committed choice', async () => {
        const initial = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, {
            revision: 7, records: { theme: { seq: 7, value: 'light' } },
        });
        let failed = false;
        const failure = new Error('Fixture write refused');
        const { values } = installGmStorageFixture(new Map(Object.entries(initial)), {
            beforeSet: (key, value) => {
                if (!failed && key === SETTINGS_STORAGE_KEY && (value as { theme?: unknown }).theme === 'dark') {
                    failed = true;
                    throw failure;
                }
            },
        });
        await expect(saveHostedAppearance({ key: 'theme', value: 'dark' })).rejects.toThrow('Fixture write refused');
        expect(failed).toBe(true);
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'light' }, intentLedger: { revision: 7 },
        });
        await saveHostedAppearance({ key: 'theme', value: 'dark' });
        expect(await readBackupSettingsPersistenceView(Object.fromEntries(values))).toMatchObject({
            settings: { theme: 'dark' }, intentLedger: { revision: 8 },
        });
    });
});
