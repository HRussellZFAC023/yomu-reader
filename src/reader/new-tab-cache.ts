import { gmStorageDelete } from './storage';

export const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';

export function clearNewTabOfflineCache(): Promise<void> {
    return gmStorageDelete(NEW_TAB_CACHE_KEY);
}
