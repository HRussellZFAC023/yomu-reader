import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { RETIRED_DEFAULT_SETTING_KEYS } from '../../src/reader/settings/retired-defaults';
import { planAnnotationPowerTransition, PUCK_FURIGANA_INTENT_KEYS } from '../../src/reader/app/annotation-power-policy';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import type { SettingsIntentLedger } from '../../src/reader/settings/intent-ledger';
// @ts-expect-error plain .mjs script module without type declarations
import { ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE } from '../../scripts/lib/smoke-harness.mjs';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// 2.1 changed the annotation defaults (ADR-0026). Every save writes the whole
// settings object, so an install that never touched these controls still has
// the 2.0 defaults written down; they must read as the new defaults, while a
// value the learner declared, or one the old defaults never had, stays.

const PRE_2_1_DEFAULTS: Partial<ReaderSettings> = {
    furiganaMode: 'all',
    furiganaHiddenStateGroups: ['known', 'due', 'failed'],
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
    furiganaHiddenStateGroups: ['known', 'due'],
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

// Restores a settings backup the way Settings does and returns what the page
// adopted. With `storage`, the backup carries its settings and intent ledger.
async function restore(backup: { settings: Partial<ReaderSettings>; storage?: Record<string, unknown> }): Promise<ReaderSettings> {
    const text = JSON.stringify({ formatName: 'yomu-reader-settings', formatVersion: 3, ...backup });
    const file = new File([text], 'yomu-settings.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => text });
    let adopted: ReaderSettings | undefined;
    await restoreReaderSettingsBackup(file, await loadSettings(), {
        persistSettings: saveSettings,
        adoptSettings: settings => { adopted = settings; },
        setStatus: () => undefined,
        dictionaryStateChanged: () => undefined,
        dictionaries: {
            exportJson: vi.fn(),
            importFile: vi.fn(),
            summary: vi.fn().mockResolvedValue({ dictionaries: [] }),
        } as never,
    });
    return adopted!;
}

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

    it('read as the new defaults right after restoring a backup that never declared them', async () => {
        installGmStorageFixture();
        const storage = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, ...PRE_2_1_DEFAULTS, theme: 'dark' }, {
            revision: 1,
            records: { theme: { seq: 1, value: 'dark' } },
        });
        const adopted = await restore({ settings: { ...PRE_2_1_DEFAULTS, theme: 'dark' }, storage });
        expect(adopted).toMatchObject({ ...NEW_DEFAULTS, theme: 'dark' });
        expect(await loadSettings()).toMatchObject({ ...NEW_DEFAULTS, theme: 'dark' });
    });

    it('stay as they are when a settings-only backup carries the old defaults, and are not declared', async () => {
        await loadStored({ wordUnderlineColorSource: 'pitch', wordHighlightColorSource: 'off', wordTextColorSource: 'off' }, {
            revision: 1,
            records: { wordUnderlineColorSource: { seq: 1, value: 'pitch' } },
        });
        const adopted = await restore({ settings: { ...PRE_2_1_DEFAULTS, theme: 'dark' } });
        // The learner's own pitch underline survives a backup that only carried 2.0's.
        expect(adopted).toMatchObject({ ...NEW_DEFAULTS, wordUnderlineColorSource: 'pitch', wordHighlightColorSource: 'off', wordTextColorSource: 'off', theme: 'dark' });
        const reloaded = await loadSettings();
        expect(reloaded).toMatchObject({ furiganaMode: 'known-status', wordUnderlineColorSource: 'pitch', theme: 'dark' });
    });

    it('restore every value the old defaults never had from a settings-only backup', async () => {
        installGmStorageFixture();
        const adopted = await restore({ settings: { furiganaMode: 'hover', wordColorHiddenStateGroups: ['due'] } });
        expect(adopted).toMatchObject({ furiganaMode: 'hover', wordColorHiddenStateGroups: ['due'] });
        expect(await loadSettings()).toMatchObject({ furiganaMode: 'hover', wordColorHiddenStateGroups: ['due'] });
    });

    it('read a hidden-group list as a set, whatever order it was stored in', async () => {
        const settings = await loadStored({ furiganaHiddenStateGroups: ['failed', 'known', 'due'] });
        expect(settings.furiganaHiddenStateGroups).toEqual(['known', 'due']);
    });

    it('are declared by the smoke harness whenever a smoke sets them, so smokes keep testing what they set', () => {
        expect([...(ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE as string[])].sort()).toEqual([...RETIRED_DEFAULT_SETTING_KEYS].sort());
    });
});

// 2.0's puck declared the reading mode it switched to, the then-default 'all'
// included, and the mode to come back to after hiding, in one write with the
// remembered mode last. This ledger is what a real 2.0.12 build wrote after
// one hide, pause and resume cycle on a fresh install.
describe('reading modes the 2.0 puck declared', () => {
    const PUCK_CYCLED: SettingsIntentLedger = {
        revision: 8,
        records: {
            showFurigana: { seq: 5, value: true },
            furiganaMode: { seq: 6, value: 'all' },
            puckFuriganaModeBeforeHide: { seq: 7, value: '' },
            annotationsPaused: { seq: 8, value: false },
        },
    };
    // The same install with furigana hidden by the puck when it upgrades.
    const PUCK_HIDDEN: SettingsIntentLedger = {
        revision: 7,
        records: {
            showFurigana: { seq: 5, value: true },
            furiganaMode: { seq: 6, value: 'off' },
            puckFuriganaModeBeforeHide: { seq: 7, value: 'all' },
        },
    };

    async function storedLedger(): Promise<SettingsIntentLedger> {
        const { GM_getValue: read } = globalThis as unknown as { GM_getValue: (key: string, fallback: unknown) => Promise<unknown> };
        return await read(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null) as SettingsIntentLedger;
    }

    it('read as the new default, and the next save drops the declaration', async () => {
        const loaded = await loadStored({ ...PRE_2_1_DEFAULTS, puckFuriganaModeBeforeHide: '' }, PUCK_CYCLED);
        expect(loaded.furiganaMode).toBe('known-status');

        await saveSettings({ ...loaded, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        const ledger = await storedLedger();
        expect(Object.keys(ledger.records)).not.toContain('furiganaMode');
        expect(ledger.records.showFurigana).toMatchObject({ value: true });
        expect(await loadSettings()).toMatchObject({ furiganaMode: 'known-status', theme: 'dark' });
    });

    it('resume on the new default when the puck hid furigana before the upgrade', async () => {
        const loaded = await loadStored({ ...PRE_2_1_DEFAULTS, furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' }, PUCK_HIDDEN);
        // Hidden stays hidden: that was the learner's choice.
        expect(loaded.furiganaMode).toBe('off');
        expect(loaded.puckFuriganaModeBeforeHide).toBe('');
        expect(planAnnotationPowerTransition({ ...loaded, annotationsPaused: true }, true, DEFAULT_SETTINGS.furiganaMode))
            .toEqual({ kind: 'resume', furiganaMode: 'known-status' });
    });

    it('keep a reading mode chosen since 2.1 through a puck hide and resume', async () => {
        installGmStorageFixture();
        const chosen = { ...DEFAULT_SETTINGS, furiganaMode: 'all' as const };
        await saveSettings(chosen, { explicitUserChoiceKeys: ['furiganaMode'] });
        const hidden = { ...chosen, furiganaMode: 'off' as const, puckFuriganaModeBeforeHide: 'all' as const };
        await saveSettings(hidden, { explicitUserChoiceKeys: PUCK_FURIGANA_INTENT_KEYS });
        expect(await loadSettings()).toMatchObject({ furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' });
        await saveSettings({ ...hidden, furiganaMode: 'all', puckFuriganaModeBeforeHide: '' }, { explicitUserChoiceKeys: PUCK_FURIGANA_INTENT_KEYS });
        expect((await loadSettings()).furiganaMode).toBe('all');
    });
});
