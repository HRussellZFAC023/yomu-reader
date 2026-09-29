import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    readSettingsPersistenceViewStrictFrom,
    serializeSettingsPersistencePair,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/settings-persistence-transaction';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { DEFAULT_SETTINGS, loadSettings, PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY } from '../../src/reader/settings';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

function read(values: Record<string, unknown>) {
    return readSettingsPersistenceViewStrictFrom(async <T>(key: string, fallback: T) => (
        Object.hasOwn(values, key) ? values[key] as T : fallback
    ));
}

describe('current settings format', () => {
    it('does not create a second settings store while reading shared settings', async () => {
        vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'dark', preferJapaneseSiteLanguage: true }, { revision: 0, records: {} });
        const { values, setValue, deleteValue } = installGmStorageFixture(new Map(Object.entries(pair)));
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark', preferJapaneseSiteLanguage: true });
        expect(values.has(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();
        expect(setValue).not.toHaveBeenCalled();
        expect(deleteValue).not.toHaveBeenCalled();
    });

    it.each([SETTINGS_STORAGE_KEY, SETTINGS_INTENT_LEDGER_STORAGE_KEY])('reports a failed %s read without replacing settings', async failedKey => {
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
        const { values, getValue, setValue, deleteValue } = installGmStorageFixture(new Map(Object.entries(pair)));
        getValue.mockImplementation(async (key, fallback) => {
            if (key === failedKey) throw new Error('pair read unavailable');
            return values.has(key) ? structuredClone(values.get(key)) : fallback;
        });
        await expect(loadSettings()).rejects.toThrow('pair read unavailable');
        expect(Object.fromEntries(values)).toEqual(pair);
        expect(setValue).not.toHaveBeenCalled();
        expect(deleteValue).not.toHaveBeenCalled();
    });

    it('does not disguise unavailable storage as fresh-install defaults', async () => {
        const { getValue, setValue } = installGmStorageFixture();
        getValue.mockRejectedValue(new Error('storage unavailable'));
        await expect(loadSettings()).rejects.toThrow('storage unavailable');
        expect(setValue).not.toHaveBeenCalled();
    });

    it('does not disguise retired settings as fresh-install defaults or overwrite them', async () => {
        const oldSettings = { theme: 'dark' };
        const { values, setValue } = installGmStorageFixture(new Map([[SETTINGS_STORAGE_KEY, oldSettings]]));
        await expect(loadSettings()).rejects.toThrow('stable committed snapshot');
        expect(values.get(SETTINGS_STORAGE_KEY)).toEqual(oldSettings);
        expect(setValue).not.toHaveBeenCalled();
    });

    it('allows a fresh installation without writing defaults', async () => {
        await expect(read({})).resolves.toEqual({ settings: null, intentLedger: { revision: 0, records: {} } });
    });

    it('reads the current writer format', async () => {
        const intentLedger = { revision: 0, records: {} };
        await expect(read(serializeSettingsPersistencePair(DEFAULT_SETTINGS, intentLedger)))
            .resolves.toEqual({ settings: DEFAULT_SETTINGS, intentLedger });
    });

    it.each([
        { [SETTINGS_STORAGE_KEY]: { theme: 'dark' } },
        { [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: { revision: 0, records: {} } },
        {
            [SETTINGS_STORAGE_KEY]: { theme: 'dark' },
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: { revision: 0, records: {} },
        },
    ])('rejects unmarked settings instead of converting them: %j', async values => {
        const before = structuredClone(values);
        await expect(read(values)).rejects.toThrow('stable committed snapshot');
        expect(values).toEqual(before);
    });
});
