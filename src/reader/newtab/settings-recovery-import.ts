import { createLocalDictionaryStore } from '../dictionaries/local-store-factory';
import { DEFAULT_SETTINGS, saveSettings } from '../settings/index';
import { restoreReaderSettingsBackup } from '../settings/reader-settings-restore-adapter';

/**
 * Restores a settings file while Study is still blocked on unreadable settings.
 * Nothing trustworthy could be read, so the file is laid over the defaults, and
 * its Save replaces the unreadable pair (a full replacement never has to witness
 * a torn pair). Study has not started, so no runtime adopts the result: the
 * guard's next strict read is what lets startup continue.
 */
export function importSettingsBackupForRecovery(
    file: File,
    setStatus: (message: string) => void,
): Promise<string> {
    return restoreReaderSettingsBackup(file, DEFAULT_SETTINGS, {
        dictionaries: createLocalDictionaryStore(() => DEFAULT_SETTINGS.corsProxyUrl),
        setStatus,
        persistSettings: saveSettings,
        adoptSettings: () => undefined,
        dictionaryStateChanged: () => undefined,
    });
}
