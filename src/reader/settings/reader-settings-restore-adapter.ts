import { captureActiveLanguageProfileDictionaries } from './dictionary';
import {
    mergeDictionaryPreferences,
    normalizeReaderSettings,
    retireStaleDictionaryPreferences,
    type SaveSettingsOptions,
} from './index';
import {
    readerStorageRestorePayload,
    runSettingsRestoreTransaction,
    settingsRestoreSaveOptions,
    witnessedSettingsRestoreCandidate,
} from './settings-restore-transaction';
import {
    getReaderDictionaryExport,
    getReaderSettingsExport,
    readerDictionaryExportHasData,
} from './file-io';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import {
    parseYomitanSettingsExport,
    type ImportSummary,
    type YomitanDictionaryStore,
} from '../dictionaries/yomitan';
import { markDictionaryReplicaFresh } from '../dictionaries/replica-purge';

interface ReaderSettingsRestorePort {
    readonly dictionaries: Pick<YomitanDictionaryStore, 'exportJson' | 'importFile' | 'summary'>;
    readonly setStatus: (message: string) => void;
    readonly persistSettings: (settings: ReaderSettings, options: SaveSettingsOptions) => Promise<void>;
    readonly adoptSettings: (settings: ReaderSettings) => void;
    readonly dictionaryStateChanged: () => void;
}

interface ReaderDictionaryRestore {
    readonly imported: File;
    readonly previous: File;
}

export async function restoreReaderSettingsBackup(
    file: File,
    previousSettings: ReaderSettings,
    port: ReaderSettingsRestorePort,
): Promise<string> {
    const json = JSON.parse(await file.text()) as unknown;
    const hasTopLevelSettings = getReaderSettingsExport(json) !== null;
    let importedSettings = initialImportedSettings(json, previousSettings);
    const dictionaries = await BundledDictionaryRestore.prepare(json, port);
    const result = await runSettingsRestoreTransaction({
        storage: readerStorageRestorePayload(json),
        allowInvalidSettingsAuthorityFallback: hasTopLevelSettings,
        prepareSettings: importedView => {
            importedSettings = witnessedSettingsRestoreCandidate(
                previousSettings,
                importedSettings,
                importedView,
            );
        },
        stageBeforeSettings: () => dictionaries.stage(importedSettings).then(settings => {
            importedSettings = settings;
        }),
        rollbackBeforeSettings: () => dictionaries.rollback(),
        publishSettings: importedView => port.persistSettings(
            importedSettings,
            settingsRestoreSaveOptions(previousSettings, importedSettings, importedView),
        ),
    });
    port.adoptSettings(importedSettings);
    return importSettingsStatus(result.restoredValues, dictionaries.summary, importedSettings.interfaceLanguage);
}

class BundledDictionaryRestore {
    private mutationAttempted = false;
    private importedSummary: ImportSummary | null = null;

    private constructor(
        private readonly restore: ReaderDictionaryRestore | null,
        private readonly port: ReaderSettingsRestorePort,
    ) {}

    static async prepare(json: unknown, port: ReaderSettingsRestorePort): Promise<BundledDictionaryRestore> {
        return new BundledDictionaryRestore(await dictionaryRestoreFiles(json, port.dictionaries), port);
    }

    get summary(): ImportSummary | null {
        return this.importedSummary;
    }

    async stage(settings: ReaderSettings): Promise<ReaderSettings> {
        if (this.restore) await this.importBundledDictionaries(this.restore.imported, settings.interfaceLanguage);
        const merged = await mergeImportedDictionaryPreferences(settings, this.port.dictionaries);
        this.port.dictionaryStateChanged();
        return merged;
    }

    async rollback(): Promise<void> {
        if (!this.restore || !this.mutationAttempted) return;
        await this.port.dictionaries.importFile(this.restore.previous);
        await markDictionaryReplicaFresh();
        this.port.dictionaryStateChanged();
    }

    private async importBundledDictionaries(file: File, language: InterfaceLanguage): Promise<void> {
        this.mutationAttempted = true;
        this.port.setStatus(uiText(language, 'importingBundledDictionaries'));
        this.importedSummary = await this.port.dictionaries.importFile(
            file,
            message => this.port.setStatus(message),
        );
        await markDictionaryReplicaFresh();
    }
}

async function dictionaryRestoreFiles(
    json: unknown,
    dictionaries: Pick<YomitanDictionaryStore, 'exportJson'>,
): Promise<ReaderDictionaryRestore | null> {
    const dictionaryExport = getReaderDictionaryExport(json);
    if (!readerDictionaryExportHasData(dictionaryExport)) return null;
    return {
        imported: jsonFile(dictionaryExport, 'yomu-dictionaries-from-settings.json'),
        previous: new File(
            [await dictionaries.exportJson()],
            'yomu-dictionaries-before-settings-restore.json',
            { type: 'application/json' },
        ),
    };
}

function jsonFile(value: unknown, filename: string): File {
    return new File([JSON.stringify(value)], filename, { type: 'application/json' });
}

async function mergeImportedDictionaryPreferences(
    settings: ReaderSettings,
    dictionaries: Pick<YomitanDictionaryStore, 'summary'>,
): Promise<ReaderSettings> {
    const importedSummary = await dictionaries.summary().catch(() => ({ dictionaries: [] }));
    const importedNames = importedSummary.dictionaries.map(item => item.title);
    const importedTypes = Object.fromEntries(importedSummary.dictionaries.map(item => [item.title, item.type]));
    const merged = mergeDictionaryPreferences(
        retireStaleDictionaryPreferences(settings.dictionaryPreferences, importedNames),
        importedNames,
        importedTypes,
    );
    return captureActiveLanguageProfileDictionaries(settings, merged);
}

function initialImportedSettings(json: unknown, current: ReaderSettings): ReaderSettings {
    const readerSettings = getReaderSettingsExport(json);
    return readerSettings
        ? normalizeReaderSettings({
            ...current,
            ...readerSettings,
            shortcuts: { ...current.shortcuts, ...readerSettings.shortcuts },
        })
        : importedYomitanSettings(json, current);
}

function importedYomitanSettings(json: unknown, current: ReaderSettings): ReaderSettings {
    const imported = parseYomitanSettingsExport(json, current.interfaceLanguage);
    return normalizeReaderSettings({
        ...current,
        ...imported.settings,
        shortcuts: {
            ...current.shortcuts,
            ...(imported.settings.shortcuts ?? {}),
        },
    });
}

function importSettingsStatus(
    restoredValues: number,
    dictionarySummary: ImportSummary | null,
    language: InterfaceLanguage,
): string {
    const details = restoreStatusDetails(restoredValues, dictionarySummary, language);
    return details.length
        ? uiText(language, 'settingsImportedWithDetails').replace('{details}', details.join('; '))
        : uiText(language, 'settingsImported');
}

function restoreStatusDetails(
    restoredValues: number,
    dictionarySummary: ImportSummary | null,
    language: InterfaceLanguage,
): string[] {
    const details: string[] = [];
    if (restoredValues) {
        details.push(countStatus(uiText(language, 'restoredStoredChoices'), restoredValues));
    }
    if (dictionarySummary) {
        details.push(countStatus(uiText(language, 'importedDictionaryRecordCount'), dictionarySummary.entries));
    }
    return details;
}

function countStatus(template: string, count: number): string {
    return template
        .replace('{count}', count.toLocaleString())
        .replace('{plural}', count === 1 ? '' : 's');
}
