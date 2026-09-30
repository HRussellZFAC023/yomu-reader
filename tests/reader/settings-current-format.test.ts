import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    readSettingsPersistenceViewStrictFrom,
    serializeSettingsPersistencePair,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/settings-persistence-transaction';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { DEFAULT_SETTINGS, loadSettings, PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, saveSettings } from '../../src/reader/settings';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { v193UserscriptStore as v193Store } from './helpers/upgrade-v193-corpus';

const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';

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

    it.each([
        'b0-userscript-untouched-pre-ledger',
        'b-userscript-machine-only-unmarked',
        // What a 1.8.80 Settings Save left, pin store included, as store users on 1.8.x hold it.
        'inputs/v1.8.80-pinned',
    ])('reads the unmarked record a shipped release left (%s) without rewriting it', async scenario => {
        const store = v193Store(scenario);
        const before = structuredClone(Object.fromEntries(store));
        const { values, setValue, deleteValue } = installGmStorageFixture(store);
        await expect(loadSettings()).resolves.toMatchObject({
            theme: 'dark',
            apiKey: 'corpus0000000000000000000000jpdb',
            subtitleFontSize: 40,
            learningTargetChosen: true,
        });
        expect(Object.fromEntries(values)).toEqual(before);
        expect(setValue).not.toHaveBeenCalled();
        expect(deleteValue).not.toHaveBeenCalled();
    });

    it.each([
        'c1-userscript-folded-pins-explicit',
        'c2-userscript-folded-pins-machine',
    ])('reads the seq-0 records v1.9.3 folded from the 1.8.x pin store (%s)', async scenario => {
        const { setValue } = installGmStorageFixture(v193Store(scenario));
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark', showFurigana: false, accentColor: '#2563eb' });
        expect(setValue).not.toHaveBeenCalled();
    });

    it('stamps a canonical committed pair on the next Save of an unmarked v1.9.3 store', async () => {
        const { values } = installGmStorageFixture(v193Store('c2-userscript-folded-pins-machine'));
        await saveSettings({ ...await loadSettings(), subtitleFontSize: 44 }, { explicitUserChoiceKeys: ['subtitleFontSize'] });
        const settings = values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>;
        const ledger = values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY) as { revision: number; records: Record<string, { seq: number }> } & Record<string, unknown>;
        expect(settings[COMMIT_FIELD]).toEqual(expect.any(String));
        expect(ledger[COMMIT_FIELD]).toBe(settings[COMMIT_FIELD]);
        expect(ledger.records.theme).toEqual({ seq: 0, value: 'dark' });
        expect(ledger.records.subtitleFontSize.seq).toBe(ledger.revision);
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark', subtitleFontSize: 44 });
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
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: { revision: 3, records: { theme: { seq: 3, value: 'dark' } } },
        },
    ])('reads an unmarked pair as committed without converting it: %j', async values => {
        const before = structuredClone(values);
        const view = await read(values);
        expect(view.settings).toEqual(values[SETTINGS_STORAGE_KEY] ?? null);
        expect(view.intentLedger).toEqual(values[SETTINGS_INTENT_LEDGER_STORAGE_KEY] ?? { revision: 0, records: {} });
        expect(values).toEqual(before);
    });

    it('lifts a ledger revision below its highest seq, as v1.9.3 did', async () => {
        const marked = (value: object) => ({ ...value, [COMMIT_FIELD]: 'commit' });
        await expect(read({
            [SETTINGS_STORAGE_KEY]: marked({ theme: 'dark' }),
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: marked({ revision: 1, records: { apiKey: { seq: 0, value: 'k' }, theme: { seq: 2, value: 'dark' } } }),
        })).resolves.toMatchObject({ intentLedger: { revision: 2, records: { apiKey: { seq: 0, value: 'k' } } } });
    });

    it.each([
        { settings: 'settings-commit', ledger: 'other-commit' },
        { settings: 'settings-commit', ledger: undefined },
        { settings: undefined, ledger: 'ledger-commit' },
        { settings: '', ledger: '' },
    ])('keeps retry-then-fail for a torn pair: %j', async ids => {
        const marked = (value: object, id: string | undefined) => (id === undefined ? value : { ...value, [COMMIT_FIELD]: id });
        await expect(read({
            [SETTINGS_STORAGE_KEY]: marked({ ...DEFAULT_SETTINGS, theme: 'dark' }, ids.settings),
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: marked({ revision: 0, records: {} }, ids.ledger),
        })).rejects.toThrow('stable committed snapshot');
    });

    it('writes a fresh committed pair over a pair that stays torn on the next Save', async () => {
        const { values } = installGmStorageFixture(new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'light', [COMMIT_FIELD]: 'settings-commit' }],
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY, { revision: 2, records: { theme: { seq: 2, value: 'light' } }, [COMMIT_FIELD]: 'other-commit' }],
        ]));
        await expect(loadSettings()).rejects.toThrow('stable committed snapshot');

        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        const settings = values.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>;
        const ledger = values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY) as Record<string, unknown>;
        expect(settings[COMMIT_FIELD]).toEqual(expect.any(String));
        expect(ledger[COMMIT_FIELD]).toBe(settings[COMMIT_FIELD]);
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
    });

    it.each([
        { case: 'an unavailable backend', ledger: { revision: 0, records: {} }, error: 'storage unavailable' },
        { case: 'a committed pair with a malformed ledger', ledger: { revision: -1, records: {} }, error: 'stable committed snapshot' },
    ])('still refuses a Save over $case without touching the pair', async ({ ledger, error }) => {
        const stored = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'light', [COMMIT_FIELD]: 'commit' }],
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY, { ...ledger, [COMMIT_FIELD]: 'commit' }],
        ]);
        const before = structuredClone(Object.fromEntries(stored));
        const { values, getValue } = installGmStorageFixture(stored);
        if (error === 'storage unavailable') getValue.mockRejectedValue(new Error(error));

        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] }))
            .rejects.toThrow(error);

        expect(values.get(SETTINGS_STORAGE_KEY)).toEqual(before[SETTINGS_STORAGE_KEY]);
        expect(values.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual(before[SETTINGS_INTENT_LEDGER_STORAGE_KEY]);
    });
});
