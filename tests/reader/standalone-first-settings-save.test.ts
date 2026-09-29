import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('standalone first settings save', () => {

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
