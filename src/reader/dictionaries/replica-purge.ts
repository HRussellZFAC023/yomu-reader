import { Logger } from '../app/logger';
import { ensureManagedWebStorageCurrent, gmStorageGet, gmStorageSet, managedLocalStorage } from '../app/storage';

const log = Logger.scope('DictionaryReplicaPurge');

// TRANSITIONAL — delete this module once the pre-1.8.78 replicas are judged
// drained (target: the 1.9.x cleanup pass).
//
// Earlier releases copied the imported dictionary set into the IndexedDB of
// every origin that showed Japanese text ("replication"). That mechanism is
// gone — dictionaries now live only where they are imported — but its copies
// remain on users' disks, gigabytes per origin, and no single page can reach
// another origin's storage to remove them.
//
// The purge is therefore a shared GM timestamp: clearing dictionary storage
// (or a factory reset) stamps it, and every origin compares it against its own
// local marker on the next visit, deleting its copy once. The drain follows
// the user's ordinary browsing; no origin list is kept anywhere.
const PURGE_REQUEST_KEY = 'yomu:dictionary-replica-purge:v1';
const PURGE_HONORED_KEY = 'yomu:dictionary-replica-purged:v1';
const DICTIONARY_DB_NAME = 'jpdb-popup-reader-yomitan';

export async function requestDictionaryReplicaPurge(now: () => number = Date.now): Promise<void> {
    await gmStorageSet(PURGE_REQUEST_KEY, now());
}

/**
 * Deletes this origin's dictionary database when a purge was requested after
 * this origin last honored one. Returns true when a deletion happened. The
 * honored marker is only written after a successful delete, so a blocked
 * database (another Yomu tab holding a connection) retries on the next visit.
 */
export async function honorDictionaryReplicaPurge(): Promise<boolean> {
    const requestedAt = await gmStorageGet<number>(PURGE_REQUEST_KEY, 0);
    if (requestedAt) await ensureManagedWebStorageCurrent();
    if (!requestedAt || requestedAt <= honoredAt()) return false;
    const deleted = await deleteDictionaryDatabase();
    if (!deleted) return false;
    try {
        managedLocalStorage.setItem(PURGE_HONORED_KEY, String(requestedAt));
    } catch {
        // Origins without storage simply delete again next visit — harmless,
        // the database is already gone.
    }
    log.info('Removed this origin\'s dictionary copy after an all-sites purge');
    return true;
}

/**
 * An import on this origin supersedes any earlier purge: without this stamp,
 * a site visited for the first time after a purge would delete a dictionary
 * the learner just imported there.
 */
export async function markDictionaryReplicaFresh(now: () => number = Date.now): Promise<void> {
    const requestedAt = await gmStorageGet<number>(PURGE_REQUEST_KEY, 0);
    if (!requestedAt) return;
    await ensureManagedWebStorageCurrent();
    try {
        managedLocalStorage.setItem(PURGE_HONORED_KEY, String(Math.max(now(), requestedAt)));
    } catch {
        // Without the stamp the next visit deletes the import; the learner
        // can re-import, and origins without storage cannot hold a multi-GB
        // dictionary database anyway.
    }
}

function honoredAt(): number {
    try {
        return Number(managedLocalStorage.getItem(PURGE_HONORED_KEY)) || 0;
    } catch {
        return 0;
    }
}

function deleteDictionaryDatabase(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(false);
    return new Promise(resolve => {
        try {
            const request = indexedDB.deleteDatabase(DICTIONARY_DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            // Blocked means another tab holds the database open; give up for
            // this visit rather than waiting on it, and retry next load.
            request.onblocked = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}
