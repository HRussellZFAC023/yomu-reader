import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { RETIRED_DEFAULT_SETTING_KEYS } from '../../src/reader/settings/retired-defaults';
import { planAnnotationPowerTransition, PUCK_FURIGANA_INTENT_KEYS } from '../../src/reader/app/annotation-power-policy';
import { recordSettingsIntent, SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
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

// The legacy puck stores only the latest value per key. Its adjacent sequence
// numbers cannot distinguish a remembered Settings choice from an old default.
describe('declared reading modes across the old puck lifecycle', () => {
    const OLD_PUCK_KEYS = ['showFurigana', 'furiganaMode', 'puckFuriganaModeBeforeHide'] as const;

    function explicitAllThenOldPuckHide() {
        const chosen = { ...DEFAULT_SETTINGS, ...PRE_2_1_DEFAULTS, furiganaMode: 'all' as const };
        const chosenLedger = recordSettingsIntent({ revision: 9, records: {} }, ['furiganaMode'], chosen);
        const hide = planAnnotationPowerTransition(chosen, true, 'all');
        expect(hide).toEqual({ kind: 'hide-furigana', rememberedMode: 'all' });
        const hidden = { ...chosen, furiganaMode: 'off' as const, puckFuriganaModeBeforeHide: 'all' as const };
        const ledger = recordSettingsIntent(chosenLedger, OLD_PUCK_KEYS, hidden);
        expect(ledger.records.furiganaMode).toEqual({ seq: 12, value: 'off' });
        expect(ledger.records.puckFuriganaModeBeforeHide).toEqual({ seq: 13, value: 'all' });
        return { hidden, ledger };
    }

    async function storedLedger(): Promise<SettingsIntentLedger> {
        const { GM_getValue: read } = globalThis as unknown as { GM_getValue: (key: string, fallback: unknown) => Promise<unknown> };
        return await read(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null) as SettingsIntentLedger;
    }

    it('keeps explicit All through a legacy hide, upgrade, unrelated Save and resume', async () => {
        const { hidden, ledger } = explicitAllThenOldPuckHide();
        const loaded = await loadStored(hidden, ledger);
        expect(loaded).toMatchObject({ furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' });
        await saveSettings({ ...loaded, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        expect((await storedLedger()).records.puckFuriganaModeBeforeHide).toEqual({ seq: 13, value: 'all' });
        const reloaded = await loadSettings();
        expect(planAnnotationPowerTransition({ ...reloaded, annotationsPaused: true }, true, DEFAULT_SETTINGS.furiganaMode))
            .toEqual({ kind: 'resume', furiganaMode: 'all' });
        await saveSettings({ ...reloaded, furiganaMode: 'all', puckFuriganaModeBeforeHide: '' }, { explicitUserChoiceKeys: PUCK_FURIGANA_INTENT_KEYS });
        expect(await loadSettings()).toMatchObject({ furiganaMode: 'all', theme: 'dark' });
    });

    it('keeps the same declared remembered mode when restoring the legacy backup', async () => {
        const { hidden, ledger } = explicitAllThenOldPuckHide();
        installGmStorageFixture();
        const adopted = await restore({ settings: hidden, storage: serializeSettingsPersistencePair(hidden, ledger) });
        expect(adopted).toMatchObject({ furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' });
        expect(await loadSettings()).toMatchObject({ furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' });
        expect(planAnnotationPowerTransition({ ...adopted, annotationsPaused: true }, true, DEFAULT_SETTINGS.furiganaMode))
            .toEqual({ kind: 'resume', furiganaMode: 'all' });
    });

    it('preserves a completed old puck cycle whose original mode provenance is unknowable', async () => {
        const { hidden, ledger } = explicitAllThenOldPuckHide();
        const resumed = { ...hidden, furiganaMode: 'all' as const, puckFuriganaModeBeforeHide: '' as const };
        const cycledLedger = recordSettingsIntent(ledger, OLD_PUCK_KEYS, resumed);
        const loaded = await loadStored(resumed, cycledLedger);
        expect(loaded.furiganaMode).toBe('all');
        await saveSettings({ ...loaded, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        expect((await storedLedger()).records.furiganaMode).toEqual(cycledLedger.records.furiganaMode);
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
