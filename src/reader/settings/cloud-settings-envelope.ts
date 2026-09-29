import { isRecord } from '../core/object-utils';
import { userFacingError } from '../app/user-facing-errors';
import type { CloudSettingsSyncSnapshot } from './cloud-sync';
import { RETIRED_SETTINGS_STORAGE_KEYS } from './settings-authority-storage-keys';

/** Validate the cloud transport envelope without normalizing or redacting backup data. */
export function validateCloudSettingsEnvelope(value: unknown): CloudSettingsSyncSnapshot {
    if (!isRecord(value) || value.formatName !== 'yomu-google-drive-settings-sync' || value.formatVersion !== 1) {
        throw userFacingError('settingsImportUnsupportedFormat');
    }
    if (!isRecord(value.settings)
        || typeof value.syncedAt !== 'string' || !Number.isFinite(Date.parse(value.syncedAt))
        || (value.storage !== undefined && !isRecord(value.storage))) {
        throw userFacingError('settingsImportIncomplete');
    }
    if (value.storage && RETIRED_SETTINGS_STORAGE_KEYS.some(key => Object.hasOwn(value.storage as object, key))) {
        throw userFacingError('settingsImportUnsupportedFormat');
    }
    return value as unknown as CloudSettingsSyncSnapshot;
}
