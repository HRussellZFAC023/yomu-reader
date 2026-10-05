import { describe, expect, it, vi } from 'vitest';
import { parseReaderSettingsBackup, readerDictionaryExportHasData } from '../../src/reader/settings/file-io';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { v193BackupFile } from './helpers/upgrade-v193-corpus';

const current = { formatName: 'yomu-reader-settings', formatVersion: 3, settings: { theme: 'dark' } };
const unsupported = [
    { ...current, formatName: 'jpdb-popup-reader-settings' },
    { ...current, formatVersion: 1 },
    { ...current, formatVersion: 2 },
    { formatName: 'yomu-reader-settings', settings: { theme: 'dark' } },
    { profiles: [{ options: { general: { popupTheme: 'dark' } } }] },
    { ...current, settings: ['theme', 'dark'] },
    { ...current, dictionaryData: { formatName: 'jpdb-reader-yomitan-dictionaries', entries: [] } },
    { ...current, storage: [] },
];

function file(payload: unknown): File {
    const text = JSON.stringify(payload);
    const input = new File([text], 'settings.json', { type: 'application/json' });
    Object.defineProperty(input, 'text', { value: async () => text, configurable: true });
    return input;
}

function restorePort() {
    return {
        dictionaries: { exportJson: vi.fn(), importFile: vi.fn(), summary: vi.fn() },
        setStatus: vi.fn(), persistSettings: vi.fn(), adoptSettings: vi.fn(), dictionaryStateChanged: vi.fn(),
    };
}

describe('current settings file contract', () => {
    it('accepts the current format and its bundled dictionaries', () => {
        const dictionaries = {
            formatName: 'yomu-yomitan-dictionaries', formatVersion: 2,
            terms: [{ expression: '読む', reading: 'よむ', glossary: ['to read'], dictionary: 'Dictionary' }],
        };
        const parsed = parseReaderSettingsBackup({ ...current, dictionaries, storage: {} });
        expect(parsed?.settings).toEqual({ theme: 'dark' });
        expect(parsed?.dictionaries).toBe(dictionaries);
        expect(readerDictionaryExportHasData(parsed?.dictionaries)).toBe(true);
    });

    it('accepts the file v1.9.3 exported, ignoring the retired pin key it carries', () => {
        const exported = v193BackupFile();
        const parsed = parseReaderSettingsBackup(exported);
        expect(parsed?.settings).toEqual(exported.settings);
        expect(parsed?.storage).toHaveProperty('yomu:explicit-user-settings:v1');
        expect(readerDictionaryExportHasData(parsed?.dictionaries)).toBe(true);
    });

    it('drops the similar-word settings v1.9.3 exported, which nothing reads any more', () => {
        const exported = v193BackupFile() as { settings: Record<string, unknown> };
        const retired = ['similarKanjiWords', 'similarKanjiWordsPriority', 'similarKanjiWordLimit'];
        for (const key of retired) expect(exported.settings).toHaveProperty(key);

        // A restore normalizes the file's settings over the current ones first.
        const restored = normalizeReaderSettings({ ...DEFAULT_SETTINGS, ...exported.settings });

        expect(restored.theme).toBe(exported.settings.theme);
        for (const key of retired) {
            expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
            expect(restored).not.toHaveProperty(key);
        }
    });

    it.each(unsupported)('rejects unsupported payload %j before touching stores', async payload => {
        expect(parseReaderSettingsBackup(payload)).toBeNull();
        const port = restorePort();
        await expect(restoreReaderSettingsBackup(file(payload), DEFAULT_SETTINGS, port))
            .rejects.toMatchObject({ yomuUiCopyKey: 'settingsImportUnsupportedFormat' });
        expect(port.persistSettings).not.toHaveBeenCalled();
        expect(port.adoptSettings).not.toHaveBeenCalled();
        expect(port.dictionaries.exportJson).not.toHaveBeenCalled();
        expect(port.dictionaries.importFile).not.toHaveBeenCalled();
    });

    it('reports malformed JSON without putting file contents in the error', async () => {
        const input = file(null);
        Object.defineProperty(input, 'text', { value: async () => 'private-file-content', configurable: true });
        const failure = await restoreReaderSettingsBackup(input, DEFAULT_SETTINGS, restorePort()).catch(error => error);
        expect(failure).toMatchObject({ yomuUiCopyKey: 'settingsImportUnsupportedFormat' });
        expect(String(failure)).not.toContain('private-file-content');
    });
});
