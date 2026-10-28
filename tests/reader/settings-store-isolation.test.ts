import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';

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
