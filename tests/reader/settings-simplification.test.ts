import type { ReaderSettings } from '../../src/reader/app/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, normalizeReaderSettings, saveSettings } from '../../src/reader/settings';
import { parseReaderSettingsBackup } from '../../src/reader/settings/file-io';
import { exportSettingsBackupSnapshot } from '../../src/reader/settings/settings-backup';
import { readBackupSettingsPersistenceView, readSettingsPersistenceViewStrict } from '../../src/reader/settings/settings-persistence-transaction';
import { adoptCurrentDefaults, RETIRED_DEFAULT_SETTING_KEYS } from '../../src/reader/settings/retired-defaults';
import { settingsRestoreSaveOptions, witnessedSettingsRestoreCandidate } from '../../src/reader/settings/settings-restore-transaction';
import { definitionSourceLabel, kanjiSourceLabel } from '../../src/reader/sources/sections';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { v193BackupFile, v193CloudSnapshot } from './helpers/upgrade-v193-corpus';

const retiredAliases = [
    'jpdbDefinitionsAlias', 'jitenDefinitionsAlias', 'bunproDefinitionsAlias', 'wanikaniDefinitionsAlias',
    'jpdbKanjiAlias', 'kanjiImmersionKitAlias', 'wanikaniKanjiAlias', 'rtkAlias', 'kanjivgAlias',
    'kanjiOriginsAlias', 'kanjiDictionariesAlias', 'immersionKitAlias', 'ankiSectionAlias',
    'studyTranslationAlias', 'studyGrammarAlias',
];
const retiredTuning = [
    'audioTimeoutMs', 'audioSelectionMode',
    'immersionKitMinLength', 'immersionKitMaxLength', 'immersionKitCategory', 'immersionKitSort',
    'immersionKitExactMatch', 'dictionarySourcesInitiallyExpanded',
];
const retired = [...retiredAliases, ...retiredTuning];
afterEach(() => { vi.unstubAllGlobals(); });

describe('simplified settings model', () => {
    it.each(retired)('drops retired %s on load and normalization', key => {
        expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
        expect(normalizeReaderSettings({ [key]: 'old custom value' })).not.toHaveProperty(key);
    });

    it('uses translated built-in source names after an old alias is discarded', () => {
        const settings = normalizeReaderSettings({ interfaceLanguage: 'ja', jitenDefinitionsAlias: 'My API', kanjivgAlias: 'Draw' } as never);
        expect(definitionSourceLabel(settings, '__jiten__')).toBe('Jiten');
        expect(kanjiSourceLabel(settings, '__kanji_stroke__')).toBe('筆順練習');
    });

    it.each([
        ['v1.9.3 file', v193BackupFile],
        ['v1.9.3 Drive snapshot', v193CloudSnapshot],
    ] as const)('loads, saves and re-exports a real %s without reviving retired options', async (_name, fixture) => {
        const raw = fixture();
        const backup = parseReaderSettingsBackup(raw) ?? raw as { settings: Record<string, unknown>; storage: Record<string, unknown> };
        const previous = normalizeReaderSettings({ theme: 'light' });
        const view = await readBackupSettingsPersistenceView(backup.storage);
        expect(view).not.toBeNull();
        const settings = witnessedSettingsRestoreCandidate(previous, normalizeReaderSettings(backup.settings), view);
        const original = normalizeReaderSettings(view!.settings as Partial<ReaderSettings>);
        // A restore reads the backup's undeclared 2.0 annotation defaults as
        // 2.1's (ADR-0026); every other value is the backup's own.
        expect(settings).toEqual(adoptCurrentDefaults(original, view!.intentLedger, DEFAULT_SETTINGS));
        const retiredKeys = new Set<string>(RETIRED_DEFAULT_SETTING_KEYS);
        const differs = (left: ReaderSettings, right: ReaderSettings) => Object.keys(left)
            .filter(key => JSON.stringify(left[key as keyof ReaderSettings]) !== JSON.stringify(right[key as keyof ReaderSettings]));
        expect(differs(settings, original).filter(key => !retiredKeys.has(key))).toEqual([]);
        for (const key of retired) expect(settings).not.toHaveProperty(key);
        const values = new Map<string, unknown>();
        installGmStorageFixture(values);
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...values.keys()]));
        await saveSettings(settings, settingsRestoreSaveOptions(previous, settings, view));
        // The backup's 2.0 annotation defaults that nobody declared read as
        // 2.1's (ADR-0026); every other value round-trips unchanged.
        const loaded = await loadSettings();
        const { intentLedger } = await readSettingsPersistenceViewStrict();
        expect(loaded).toEqual(adoptCurrentDefaults(settings, intentLedger, DEFAULT_SETTINGS));
        expect(differs(loaded, settings).filter(key => !retiredKeys.has(key))).toEqual([]);
        const exported = await exportSettingsBackupSnapshot(settings);
        expect(exported.settings).toEqual(settings);
        const serialized = JSON.stringify(exported);
        for (const key of retired) expect(serialized).not.toContain(`"${key}"`);
        // The compatibility path must not discard credentials, access choices,
        // dictionary identities, review destinations or shortcut customizations.
        for (const key of ['apiKey', 'ocrProvider', 'ankiEnabled', 'ankiDeck', 'dictionaryPreferences', 'shortcuts'] as const) {
            expect(exported.settings[key]).toEqual(original[key]);
        }
    });
});
