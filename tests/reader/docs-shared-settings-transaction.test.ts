import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import * as storage from '../../src/reader/app/storage';
import * as provenance from '../../src/reader/settings/hosted-settings-provenance';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { SETTINGS_PERSISTENCE_STORAGE_LEASE, serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

function docsSharedWriter(): (patch: Record<string, unknown>, userChoice: boolean) => Promise<void> {
    const source = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
    const functionSource = ['writeStoredThemePreference', 'writeStoredSettingsPatch', 'propagateSettingsPatchToSharedStorage']
        .map(name => {
            const body = source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, 'm'))?.[0];
            if (!body) throw new Error(`Docs writer missing: ${name}`);
            return body;
        }).join('\n');
    const compiled = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const dependencies = {
        ...storage, ...provenance, SETTINGS_PERSISTENCE_STORAGE_LEASE, SETTINGS_STORAGE_KEY,
        localStorage,
        readStoredSettings: () => JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
        isHostedSettingsRecord: (value: unknown) => value && typeof value === 'object' && !Array.isArray(value),
    };
    return Function(...Object.keys(dependencies), `let hostedSharedSettingsWrite = Promise.resolve(); let hostedSettingsEventPatch = {}; ${compiled}
        return async (patch, userChoice) => {
            if (userChoice) writeStoredThemePreference(patch.theme);
            else writeStoredSettingsPatch(patch);
            await hostedSharedSettingsWrite;
        };`)(...Object.values(dependencies));
}

it('keeps a docs theme choice after reloading settings with an older recorded preference', async () => {
    const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, {
        revision: 1, records: { theme: { seq: 1, value: 'light' } },
    });
    installGmStorageFixture(new Map(Object.entries(pair)));
    await docsSharedWriter()({ theme: 'dark' }, true);
    await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
});

it('does not convert passive appearance propagation into a new user choice', async () => {
    const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'dark' }, {
        revision: 1, records: { theme: { seq: 1, value: 'dark' } },
    });
    const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
    await docsSharedWriter()({ theme: 'light' }, false);
    expect(values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'dark' });
    expect(values.get('yomu:settings-intent:v2')).toEqual(pair['yomu:settings-intent:v2']);
});

it('does not invent intent when an unpinned passive preference changes', async () => {
    const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'dark' }, { revision: 0, records: {} });
    const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
    await docsSharedWriter()({ theme: 'light' }, false);
    expect(values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'light' });
    expect(values.get('yomu:settings-intent:v2')).toMatchObject({ revision: 0, records: {} });
});

it('does not publish another transaction for an unchanged passive appearance notification', async () => {
    const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
    const fixture = installGmStorageFixture(new Map(Object.entries(pair)));
    await docsSharedWriter()({ theme: DEFAULT_SETTINGS.theme }, false);
    expect(fixture.values.get(SETTINGS_STORAGE_KEY)).toEqual(pair[SETTINGS_STORAGE_KEY]);
    expect(fixture.setValue.mock.calls.filter(([key]) => Object.hasOwn(pair, key))).toEqual([]);
});

it('does not patch a mismatched canonical pair', async () => {
    const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
    pair[SETTINGS_STORAGE_KEY] = { ...DEFAULT_SETTINGS, __yomuSettingsPersistenceCommitV1: 'mismatched' };
    const fixture = installGmStorageFixture(new Map(Object.entries(pair)));
    await docsSharedWriter()({ theme: 'dark' }, true);
    for (const [key, value] of Object.entries(pair)) expect(fixture.values.get(key)).toEqual(value);
    expect(fixture.setValue.mock.calls.filter(([key]) => Object.hasOwn(pair, key))).toEqual([]);
});

it('persists a standalone hosted theme choice through the same control without a GM backend', async () => {
    vi.stubGlobal('location', new URL('https://yomureader.com/'));
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });
    await docsSharedWriter()({ theme: 'dark' }, true);
    await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
});

it('starts standalone settings from an explicit appearance choice', async () => {
    vi.stubGlobal('location', new URL('https://yomureader.com/'));
    await docsSharedWriter()({ theme: 'dark' }, true);
    await expect(loadSettings()).resolves.toMatchObject({
        theme: 'dark', annotationsPaused: false,
    });
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
    const ledger = JSON.parse(localStorage.getItem('yomu:settings-intent:v2') ?? '{}');
    expect(stored.__yomuSettingsPersistenceCommitV1).toEqual(expect.any(String));
    expect(ledger).toMatchObject({
        __yomuSettingsPersistenceCommitV1: stored.__yomuSettingsPersistenceCommitV1,
        revision: 1, records: { theme: { seq: 1, value: 'dark' } },
    });
});
