import type { ReaderSettings } from '../app/types';
import { exportManagedStoredValues } from '../app/storage';
import { RETIRED_SETTINGS_STORAGE_KEYS } from './settings-authority-storage-keys';
import { isRecord } from '../core/object-utils';
import { normalizeReaderSettings } from './index';
import { applySettingsIntent, SETTINGS_INTENT_LEDGER_STORAGE_KEY } from './intent-ledger';
import {
    readSettingsPersistenceViewStrict,
    serializeSettingsPersistencePair,
    SETTINGS_STORAGE_KEY,
} from './settings-persistence-transaction';

export interface SettingsBackupSnapshot {
    readonly settings: ReaderSettings;
    readonly storage: Record<string, unknown>;
}

/** File and cloud backups share the current model and one witnessed authority pair. */
export async function exportSettingsBackupSnapshot(fallbackSettings: ReaderSettings): Promise<SettingsBackupSnapshot> {
    const storage = await exportManagedStoredValues();
    for (const key of RETIRED_SETTINGS_STORAGE_KEYS) delete storage[key];
    const view = await readSettingsPersistenceViewStrict();
    if (!isRecord(view.settings)) {
        if (Object.hasOwn(storage, SETTINGS_STORAGE_KEY) || Object.hasOwn(storage, SETTINGS_INTENT_LEDGER_STORAGE_KEY)) {
            throw new Error('Could not capture canonical settings for backup.');
        }
        return structuredClone({ settings: normalizeReaderSettings(fallbackSettings), storage });
    }
    const current = normalizeReaderSettings({
        ...fallbackSettings,
        ...view.settings,
        shortcuts: {
            ...fallbackSettings.shortcuts,
            ...(isRecord(view.settings.shortcuts) ? view.settings.shortcuts : {}),
        },
    });
    const intentLedger = {
        revision: view.intentLedger.revision,
        records: Object.fromEntries(Object.entries(view.intentLedger.records).filter(([key]) => Object.hasOwn(current, key))),
    };
    const settings = normalizeReaderSettings(applySettingsIntent(current, intentLedger));
    return structuredClone({ settings, storage: { ...storage, ...serializeSettingsPersistencePair(settings, intentLedger) } });
}
