import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { RETIRED_DEFAULT_SETTING_KEYS } from '../../src/reader/settings/retired-defaults';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import type { SettingsIntentLedger } from '../../src/reader/settings/intent-ledger';
// @ts-expect-error plain .mjs script module without type declarations
import { ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE } from '../../scripts/lib/smoke-harness.mjs';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// 2.1 changed the annotation defaults (ADR-0025). Every save writes the whole
// settings object, so an install that never touched these controls still has
// the 2.0 defaults written down; they must read as the new defaults, while a
// value the learner declared, or one the old defaults never had, stays.

const PRE_2_1_DEFAULTS: Partial<ReaderSettings> = {
    furiganaMode: 'all',
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'anki',
    subtitleHighlightColorSource: 'jpdb',
    subtitleUnderlineColorSource: 'pitch',
    subtitleTextColorSource: 'anki',
    wordColorHiddenStateGroups: [],
};

const NEW_DEFAULTS: Partial<ReaderSettings> = {
    furiganaMode: 'known-status',
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'status',
    wordTextColorSource: 'off',
    subtitleHighlightColorSource: 'off',
    subtitleUnderlineColorSource: 'status',
    subtitleTextColorSource: 'off',
    wordColorHiddenStateGroups: ['known', 'ignored'],
};

const EMPTY_LEDGER: SettingsIntentLedger = { revision: 0, records: {} };

async function loadStored(settings: Partial<ReaderSettings>, ledger = EMPTY_LEDGER): Promise<ReaderSettings> {
    const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, ...settings }, ledger);
    installGmStorageFixture(new Map(Object.entries(pair)));
    return loadSettings();
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('retired annotation defaults', () => {
    it('are what a fresh install starts with', () => {
        expect(DEFAULT_SETTINGS).toMatchObject(NEW_DEFAULTS);
    });

    it('read as the new defaults when the learner never chose them', async () => {
        expect(await loadStored(PRE_2_1_DEFAULTS)).toMatchObject(NEW_DEFAULTS);
    });

    it('read as the new defaults from a pre-transaction settings blob too', async () => {
        installGmStorageFixture(new Map([[SETTINGS_STORAGE_KEY, { ...PRE_2_1_DEFAULTS, theme: 'dark' }]]));
        expect(await loadSettings()).toMatchObject({ ...NEW_DEFAULTS, theme: 'dark' });
    });

    it('keep a value the learner declared, even when it was the old default, and its group with it', async () => {
        const ledger: SettingsIntentLedger = {
            revision: 2,
            records: {
                wordUnderlineColorSource: { seq: 1, value: 'pitch' },
                furiganaMode: { seq: 2, value: 'all' },
            },
        };
        const settings = await loadStored(PRE_2_1_DEFAULTS, ledger);
        expect(settings.furiganaMode).toBe('all');
        // A colour channel set is one configuration: declaring one channel keeps all three.
        expect(settings).toMatchObject({ wordHighlightColorSource: 'jpdb', wordUnderlineColorSource: 'pitch', wordTextColorSource: 'anki' });
        expect(settings).toMatchObject({ subtitleHighlightColorSource: 'off', subtitleUnderlineColorSource: 'status', subtitleTextColorSource: 'off' });
        expect(settings.wordColorHiddenStateGroups).toEqual(['known', 'ignored']);
    });

    it('keep a colour channel set whole when the learner changed any one channel', async () => {
        // The stale double-pitch set from earlier builds: pitch highlight beside
        // the old pitch underline. Replacing only the underline would paint pitch
        // boxes behind every word, a look nobody chose.
        const settings = await loadStored({ ...PRE_2_1_DEFAULTS, wordHighlightColorSource: 'pitch', subtitleTextColorSource: 'off' });
        expect(settings).toMatchObject({ wordHighlightColorSource: 'pitch', wordUnderlineColorSource: 'pitch', wordTextColorSource: 'anki' });
        expect(settings).toMatchObject({ subtitleHighlightColorSource: 'jpdb', subtitleUnderlineColorSource: 'pitch', subtitleTextColorSource: 'off' });
        expect(settings.furiganaMode).toBe('known-status');
    });

    it('keep every value the old defaults never had', async () => {
        const choices: Partial<ReaderSettings> = {
            furiganaMode: 'hover',
            wordHighlightColorSource: 'pitch',
            wordUnderlineColorSource: 'off',
            wordTextColorSource: 'status',
            subtitleHighlightColorSource: 'status',
            subtitleUnderlineColorSource: 'jpdb',
            subtitleTextColorSource: 'pitch',
            wordColorHiddenStateGroups: ['due'],
        };
        expect(await loadStored(choices)).toMatchObject(choices);
    });

    it('are declared by the smoke harness whenever a smoke sets them, so smokes keep testing what they set', () => {
        expect([...(ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE as string[])].sort()).toEqual([...RETIRED_DEFAULT_SETTING_KEYS].sort());
    });
});
