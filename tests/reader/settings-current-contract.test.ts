import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, normalizeReaderSettings, normalizeAudioSources, normalizeOcrProvider, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { readBackupSettingsPersistenceView, readSettingsPersistenceViewStrictFrom, serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { exportSettingsBackupSnapshot } from '../../src/reader/settings/settings-backup';
import { RETIRED_SETTINGS_STORAGE_KEYS } from '../../src/reader/settings/settings-authority-storage-keys';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { v193UserscriptStore } from './helpers/upgrade-v193-corpus';
import { uiText } from "../../src/reader/app/i18n";
import { effectiveFuriganaMode, effectiveReaderColorSource, effectiveSubtitleColorSource, hasStatusColorSource, statusColorSourceLabel } from "../../src/reader/settings/index";
import { renderSettingsForm } from "../../src/reader/settings/form";
import { testEnSettings } from "./helpers/settings-fixture";
import type { ReaderSettings } from "../../src/reader/app/types";

afterEach(() => { vi.unstubAllGlobals(); });

describe('current settings contract', () => {
    it.each([
        'themeAutoRestored20260730',
        'youtubeFilterNoticeRestored20260711',
        'ankiSentenceAudioMappingMigrated',
        'immersionKitExpandedLimitMigrated20260721',
    ])('ignores and omits retired migration marker %s', key => {
        expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
        expect(normalizeReaderSettings({ [key]: true } as never)).not.toHaveProperty(key);
        expect(normalizeReaderSettings({ [key]: false } as never)).not.toHaveProperty(key);
    });

    it('preserves light theme without historical migration markers', () => {
        expect(normalizeReaderSettings({ theme: 'light' }).theme).toBe('light');
    });

    it('preserves supported choices that happened to match historical defaults', () => {
        const choices = {
            theme: 'light' as const,
            youtubeShowFilterNotice: false,
            ocrLanguage: 'ja',
            ocrProvider: 'local-service' as const,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
            ankiFieldMappings: { Lapis: { audio: 'SentenceAudio' } },
            immersionKitLimitEnabled: true,
            immersionKitLimit: 3,
            jpdbDefinitionsPriority: 0,
            jitenDefinitionsPriority: 1,
            wordHighlightColorSource: 'pitch' as const,
            wordUnderlineColorSource: 'pitch' as const,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, previousSubtitle: 'Alt+ArrowLeft', nextSubtitle: 'Alt+ArrowRight' },
        };
        const normalized = normalizeReaderSettings(choices);
        expect(normalized).toMatchObject(choices);
        expect(normalizeReaderSettings(normalized)).toEqual(normalized);
    });

    it('ignores unsupported aliases and uses defaults only for missing or invalid current values', () => {
        expect(normalizeOcrProvider('custom-json')).toBe(DEFAULT_SETTINGS.ocrProvider);
        expect(normalizeReaderSettings({ ocrProvider: 'local-service', ocrEndpointUrl: '' }).ocrProvider).toBe('local-service');
        expect(normalizeReaderSettings({ audioSourceUrl: 'https://retired.example/audio' }).audioSources).toEqual(DEFAULT_SETTINGS.audioSources);
        const normalized = normalizeReaderSettings({
            wordHighlightMode: 'off', newTabEnabled: true,
            learningTargetChosen: true, onboardingSeen: true,
            shortcuts: { hoverLookup: 42, retiredShortcut: 'Ctrl+K' },
        } as never);
        expect(normalized).not.toHaveProperty('wordHighlightMode');
        expect(normalized).not.toHaveProperty('newTabEnabled');
        expect(normalized).not.toHaveProperty('learningTargetChosen');
        expect(normalized).not.toHaveProperty('onboardingSeen');
        expect(normalized.shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts);
        expect(normalized.parserProvider).toBe(DEFAULT_SETTINGS.parserProvider);
    });

    it('preserves an explicit audio source list without inserting or disabling sources', () => {
        const sources = [
            { type: 'text-to-speech' as const, url: '', voice: '', enabled: true },
            { type: 'custom-json' as const, url: 'https://current.example/audio', voice: '', enabled: false },
        ];
        expect(normalizeReaderSettings({ audioSources: sources }).audioSources).toEqual(sources);
        expect(normalizeAudioSources([])).toEqual([]);
    });

    it('does not turn a backup with retired pins into current intent', async () => {
        await expect(readBackupSettingsPersistenceView({
            [SETTINGS_STORAGE_KEY]: { theme: 'light' },
            'yomu:explicit-user-settings:v1': { theme: 'dark' },
        })).resolves.toEqual({ settings: { theme: 'light' }, intentLedger: { revision: 0, records: {} } });
    });

    it('excludes retired keys from backup output without deleting stored values', async () => {
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
        const values = new Map(Object.entries(pair));
        for (const key of RETIRED_SETTINGS_STORAGE_KEYS) values.set(key, { theme: 'dark' });
        const storage = installGmStorageFixture(values);
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...values.keys()]));
        const backup = await exportSettingsBackupSnapshot(DEFAULT_SETTINGS);
        for (const key of RETIRED_SETTINGS_STORAGE_KEYS) {
            expect(backup.storage).not.toHaveProperty(key);
            expect(values.get(key)).toEqual({ theme: 'dark' });
        }
        expect(backup.settings.theme).toBe(DEFAULT_SETTINGS.theme);
        expect(storage.deleteValue).not.toHaveBeenCalled();
        await expect(readBackupSettingsPersistenceView(backup.storage)).resolves.toMatchObject({
            settings: { theme: DEFAULT_SETTINGS.theme }, intentLedger: { revision: 0, records: {} },
        });
    });

    it('never reads retired flat pins alongside a current witnessed pair', async () => {
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
        const read = vi.fn(async (key: string, fallback: unknown) => key === 'yomu:explicit-user-settings:v1'
            ? { theme: 'dark' } : pair[key] ?? fallback);
        const view = await readSettingsPersistenceViewStrictFrom(async <T>(key: string, fallback: T) => await read(key, fallback) as T);
        expect(view.intentLedger.records).toEqual({});
        expect(read.mock.calls.map(([key]) => key)).not.toContain('yomu:explicit-user-settings:v1');
    });

    it.each([
        { revision: 1, records: { theme: { value: 'dark' } } },
        { revision: 1, records: { theme: { seq: 0.5, value: 'dark' } } },
        { revision: 1, records: { theme: { seq: -1, value: 'dark' } } },
    ])('rejects export of malformed durable intent without repairing it: %j', async ledger => {
        const pair = {
            [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, __yomuSettingsPersistenceCommitV1: 'current' },
            'yomu:settings-intent:v2': { ...ledger, __yomuSettingsPersistenceCommitV1: 'current' },
        };
        const storage = installGmStorageFixture(new Map(Object.entries(pair)));
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...storage.values.keys()]));
        await expect(exportSettingsBackupSnapshot(DEFAULT_SETTINGS)).rejects.toThrow();
        expect(Object.fromEntries(storage.values)).toEqual(pair);
        expect(storage.setValue).not.toHaveBeenCalled();
        expect(storage.deleteValue).not.toHaveBeenCalled();
    });

    it('exports the seq-0 records v1.9.3 folded from the 1.8.x pin store', async () => {
        const storage = installGmStorageFixture(v193UserscriptStore('c1-userscript-folded-pins-explicit'));
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...storage.values.keys()]));
        const backup = await exportSettingsBackupSnapshot(DEFAULT_SETTINGS);
        expect(backup.settings).toMatchObject({ theme: 'dark', interfaceLanguage: 'ja' });
        expect(backup.storage['yomu:settings-intent:v2']).toMatchObject({
            revision: 2,
            records: { theme: { seq: 0, value: 'dark' }, interfaceLanguage: { seq: 2, value: 'ja' } },
        });
        expect(backup.storage).not.toHaveProperty('yomu:explicit-user-settings:v1');
        expect(storage.setValue).not.toHaveBeenCalled();
    });

    it('does not overwrite a valid choice when another stored intent record is corrupt', async () => {
        const pair = {
            [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, theme: 'dark', __yomuSettingsPersistenceCommitV1: 'current' },
            'yomu:settings-intent:v2': {
                revision: 1, records: { theme: { seq: 1, value: 'dark' }, accentColor: null },
                __yomuSettingsPersistenceCommitV1: 'current',
            },
        };
        const storage = installGmStorageFixture(new Map(Object.entries(pair)));
        await expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: [] }))
            .rejects.toThrow();
        expect(storage.values.get(SETTINGS_STORAGE_KEY)).toEqual(pair[SETTINGS_STORAGE_KEY]);
        expect(storage.values.get('yomu:settings-intent:v2')).toEqual(pair['yomu:settings-intent:v2']);
        expect(storage.setValue.mock.calls.filter(([key]) => Object.hasOwn(pair, key))).toEqual([]);
    });

    it('ignores old key donors without reading, deleting or promoting them', async () => {
        const pair = serializeSettingsPersistencePair(DEFAULT_SETTINGS, { revision: 0, records: {} });
        const donor = { apiKey: 'retired-donor-key', theme: 'dark' };
        const storage = installGmStorageFixture(new Map(Object.entries({ ...pair, 'yomu-settings': donor })));
        expect((await loadSettings()).apiKey).toBe('');
        expect(storage.getValue.mock.calls.map(([key]) => key)).not.toContain('yomu-settings');
        expect(storage.values.get('yomu-settings')).toEqual(donor);
        expect(storage.values.get(SETTINGS_STORAGE_KEY)).toEqual(pair[SETTINGS_STORAGE_KEY]);
        expect(storage.setValue.mock.calls.map(([key]) => key)).not.toContain(SETTINGS_STORAGE_KEY);
        expect(storage.deleteValue).not.toHaveBeenCalled();
    });
});

describe("settings explainable defaults", () => {
    function keyless(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
        return { ...testEnSettings(), apiKey: '', jitenApiKey: '', ankiEnabled: false, ...overrides };
    }

    function formHtml(settings: ReaderSettings): string {
        return renderSettingsForm(settings, 'https://jpdb.io/settings');
    }

    // A11: the shipped default used to hide furigana on every kanji from a fixed
    // beginner list, so a learner could not tell a "you know this" from a miss.
    // ADR-0026: readings follow what the learner's own study source knows, so a
    // missing reading always means "you know this", never a guess from a list.
    describe('A11 furigana default is explainable', () => {
        it('ships furigana that follows what the learner knows', () => {
            expect(DEFAULT_SETTINGS.furiganaMode).toBe('known-status');
        });

        it('preserves typed automatic mode and resolves it to the default', () => {
            for (const settings of [
                keyless({ yomuLocalSrsEnabled: false, furiganaMode: 'auto' }),
                keyless({ yomuLocalSrsEnabled: true, furiganaMode: 'auto' }),
                keyless({ apiKey: 'jpdb-key', ankiEnabled: true, furiganaMode: 'auto' }),
            ]) {
                expect(effectiveFuriganaMode(settings)).toBe('known-status');
                expect(normalizeReaderSettings(settings).furiganaMode).toBe('auto');
            }
        });

        it('keeps a stored difficulty choice through normalization', () => {
            const stored = normalizeReaderSettings({ ...keyless(), furiganaMode: 'difficult-kanji' });
            expect(stored.furiganaMode).toBe('difficult-kanji');
            expect(effectiveFuriganaMode(stored)).toBe('difficult-kanji');
        });

        it('explains difficulty hiding only once it is the chosen mode', () => {
            const off = formHtml(keyless({ furiganaMode: 'all' }));
            expect(off).toContain('data-furigana-difficulty-note');
            expect(off).toMatch(/data-furigana-difficulty-note[^>]* hidden/);

            const on = formHtml(keyless({ furiganaMode: 'difficult-kanji' }));
            expect(on).not.toMatch(/data-furigana-difficulty-note[^>]* hidden/);
            expect(on).toContain(uiText('en', 'furiganaDifficultKanjiHelp'));
        });
    });

    // A20: the state colour channel followed a jpdb/jiten key alone, so a learner
    // reviewing in Yomu's own deck got flat text with nothing to explain it.
    describe('A20 status colour has a source or an explanation', () => {
        it('drives the state channel from the local Yomu deck', () => {
            const settings = keyless({ yomuLocalSrsEnabled: true });
            expect(effectiveReaderColorSource(settings, 'jpdb')).toBe('jpdb');
            expect(effectiveReaderColorSource(settings, 'status')).toBe('jpdb');
            expect(effectiveSubtitleColorSource(settings, 'jpdb')).toBe('jpdb');
            expect(hasStatusColorSource(settings)).toBe(true);
        });

        it('names the local deck rather than JPDB when the local deck is the source', () => {
            expect(statusColorSourceLabel(keyless({ yomuLocalSrsEnabled: true }))).toBe('よむ deck');
            expect(statusColorSourceLabel(keyless({ apiKey: 'jpdb-key', yomuLocalSrsEnabled: true }))).toBe('JPDB');
        });

        it('reports no status source when every deck is off', () => {
            const settings = keyless({ yomuLocalSrsEnabled: false });
            expect(hasStatusColorSource(settings)).toBe(false);
            expect(statusColorSourceLabel(settings)).toBe('');
            expect(effectiveReaderColorSource(settings, 'jpdb')).toBe('off');
        });

        it('says so in the form when no deck can supply a status', () => {
            const sourced = formHtml(keyless({ yomuLocalSrsEnabled: true }));
            expect(sourced).toMatch(/data-status-color-no-source[^>]* hidden/);

            const sourceless = formHtml(keyless({ yomuLocalSrsEnabled: false }));
            expect(sourceless).not.toMatch(/data-status-color-no-source[^>]* hidden/);
            expect(sourceless).toContain(uiText('en', 'statusColorNoSourceHelp'));
        });

        it('keeps Anki as a status source on its own', () => {
            const settings = keyless({ ankiEnabled: true, yomuLocalSrsEnabled: false });
            expect(hasStatusColorSource(settings)).toBe(true);
            expect(statusColorSourceLabel(settings)).toBe('Anki');
            expect(effectiveReaderColorSource(settings, 'status')).toBe('anki');
            expect(effectiveReaderColorSource(settings, 'jpdb')).toBe('anki');
        });
    });
});

describe('unsupported settings and current validation', () => {
    it('does not infer furiganaMode from hideKnownFurigana', () => {
        expect(normalizeReaderSettings({ hideKnownFurigana: false }).furiganaMode).toBe(DEFAULT_SETTINGS.furiganaMode);
    });

    it('does not infer furiganaMode from showFurigana', () => {
        expect(normalizeReaderSettings({ showFurigana: false }).furiganaMode).toBe(DEFAULT_SETTINGS.furiganaMode);
    });

    it('coerces junk subtitleControlsMode to auto', () => {
        expect(normalizeReaderSettings({ subtitleControlsMode: 'bogus' as never }).subtitleControlsMode).toBe('auto');
    });

    it('passes valid subtitleControlsMode values through', () => {
        expect(normalizeReaderSettings({ subtitleControlsMode: 'hidden' }).subtitleControlsMode).toBe('hidden');
    });

    it('defaults and clamps native subtitle concealment strength', () => {
        expect(normalizeReaderSettings({}).subtitleNativeBlurStrength).toBe(12);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 2 }).subtitleNativeBlurStrength).toBe(4);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 99 }).subtitleNativeBlurStrength).toBe(20);
        expect(normalizeReaderSettings({ subtitleNativeBlurStrength: 17 }).subtitleNativeBlurStrength).toBe(17);
    });
});
