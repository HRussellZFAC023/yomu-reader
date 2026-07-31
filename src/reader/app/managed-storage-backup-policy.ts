import {
    isManagedStorageKey,
    isManagedStorageSlotKey,
    isPrivateManagedStorageKey,
} from './managed-storage-keys';
import { MANAGED_STATE_EPOCH_KEY } from './managed-state-epoch';
import { MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX, STORAGE_LEASE_KEY_PREFIX } from './gm-storage-lease';

const EXCLUDED_BACKUP_STORAGE_KEYS = new Set([
    'yomu:factory-reset-signal',
    MANAGED_STATE_EPOCH_KEY,
    'yomu:local-storage-provenance:v1',
    // Transient cloud-sync handoff written before an OAuth redirect. Factory
    // reset owns it via the '__yomu' prefix, but backups must not replay it.
    '__yomu_cloud_settings_sync_pending_action',
]);

export function isManagedStorageBackupKey(key: string): boolean {
    return isManagedStorageKey(key)
        && !isPrivateManagedStorageKey(key)
        && !isManagedStorageSlotKey(key)
        && !key.startsWith(MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX)
        && !key.startsWith(STORAGE_LEASE_KEY_PREFIX)
        && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
}
