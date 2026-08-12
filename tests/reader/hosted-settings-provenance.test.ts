import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
    mergeHostedSharedSettingsPatch,
    mergeHostedSettingsPatch,
} from '../../src/reader/settings/hosted-settings-provenance';

describe('VitePress hosted settings target provenance', () => {
    it('stamps only the first current hosted write as target-neutral', () => {
        expect(mergeHostedSettingsPatch({}, { theme: 'dark' })).toEqual({
            learningTargetChosen: false,
            theme: 'dark',
        });
        expect(mergeHostedSettingsPatch({ interfaceLanguage: 'en' }, { theme: 'dark' })).toEqual({
            interfaceLanguage: 'en',
            theme: 'dark',
        });
    });

    it('does not create shared learner settings from passive hosted appearance state', () => {
        expect(mergeHostedSharedSettingsPatch({}, { theme: 'light' })).toBeNull();
        expect(mergeHostedSharedSettingsPatch({}, { theme: 'dark' })).toBeNull();
    });

    it('never lets empty local appearance state overwrite an existing shared target', () => {
        expect(mergeHostedSharedSettingsPatch(
            { learningTargetChosen: true, subtitleFontSize: 48 },
            { theme: 'dark' },
        )).toEqual({ learningTargetChosen: true, subtitleFontSize: 48, theme: 'dark' });
        expect(mergeHostedSharedSettingsPatch(
            { subtitleFontSize: 48 },
            { theme: 'dark' },
        )).toEqual({ subtitleFontSize: 48, theme: 'dark' });
    });

    it('serializes the docs shared patch with the canonical settings transaction', () => {
        const theme = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
        expect(theme).toContain('withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE');
        expect(theme).toContain('gmStorageGetShared<Record<string, any> | null>');
        expect(theme).toContain('if (merged) await gmStorageSet(SETTINGS_STORAGE_KEY, merged)');
    });
});
