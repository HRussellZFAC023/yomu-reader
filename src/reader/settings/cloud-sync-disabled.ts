import type { ReaderSettings } from '../app/types';
import type { CloudSettingsSyncMetadata, CloudSettingsSyncSnapshot } from './cloud-sync';

export const CLOUD_SETTINGS_SYNC_ENABLED = false;

export function cloudSettingsSyncAvailable(): boolean {
    return false;
}

export async function uploadCloudSettingsToCloud(_settings: ReaderSettings): Promise<CloudSettingsSyncMetadata> {
    throw new Error('Google Drive settings sync is available only in the Yomu extension.');
}

export async function downloadCloudSettingsFromCloud(): Promise<CloudSettingsSyncSnapshot | null> {
    throw new Error('Google Drive settings sync is available only in the Yomu extension.');
}
