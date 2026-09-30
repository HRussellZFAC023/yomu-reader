import { isRecord } from '../core/object-utils';
import { userFacingError } from '../app/user-facing-errors';
import type { CloudSettingsSyncSnapshot } from './cloud-sync';

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
    return value as unknown as CloudSettingsSyncSnapshot;
}
