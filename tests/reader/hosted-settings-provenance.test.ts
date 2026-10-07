import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    persistHostedSharedSettingsPatch,
} from '../../src/reader/settings/hosted-settings-provenance';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { readBackupSettingsPersistenceView, serializeSettingsPersistencePair, SETTINGS_STORAGE_KEY } from '../../src/reader/settings/settings-persistence-transaction';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('VitePress hosted settings target provenance', () => {
    it('persists a first explicit appearance choice as the only shared setting', async () => {
        const { values } = installGmStorageFixture();
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, true);
        const view = await readBackupSettingsPersistenceView(Object.fromEntries(values));
        expect(view?.settings).toEqual({ theme: 'dark' });
        expect(view?.intentLedger).toMatchObject({ revision: 1, records: { theme: { seq: 1, value: 'dark' } } });
    });

    it('does not create shared learner settings from passive hosted appearance state', async () => {
        const { values } = installGmStorageFixture();
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, false);
        expect(values.has(SETTINGS_STORAGE_KEY)).toBe(false);
    });

    it('preserves existing shared preferences', async () => {
        const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, subtitleFontSize: 48 }, { revision: 0, records: {} });
        const { values } = installGmStorageFixture(new Map(Object.entries(pair)));
        await persistHostedSharedSettingsPatch({ theme: 'dark' }, true);
        expect(values.get(SETTINGS_STORAGE_KEY)).toMatchObject({ subtitleFontSize: 48, theme: 'dark' });
    });

    it('serializes the docs shared patch with the canonical settings transaction', () => {
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        expect(theme).toContain('persistHostedSharedSettingsPatch(patch, userChoice)');
        expect(theme).toContain('writeStoredSettingsPatch({ theme }, { userChoice: true })');
        expect(theme).not.toContain('gmStorageSet(SETTINGS_STORAGE_KEY');
        expect(theme).not.toContain('localStorage.setItem(SETTINGS_STORAGE_KEY');
        expect(theme).not.toContain('prepareHostedDemoVideoSettings');
    });
});
