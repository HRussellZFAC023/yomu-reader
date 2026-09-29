import { Logger } from '../../app/logger';
import { assertManagedStateMutationAllowed } from '../../app/storage';
import { dictionaryReplicaPurgeRequest, markDictionaryReplicaFresh } from '../replica-purge';

export type DictionaryImportMutation = (tx: IDBTransaction, mutate: () => void) => void;

/** Call only after validation. Replica ownership commits with the data mutation. */
export async function beginDictionaryImport(): Promise<DictionaryImportMutation> {
    await assertManagedStateMutationAllowed();
    const requestedAt = await dictionaryReplicaPurgeRequest();
    return (tx, mutate) => markDictionaryReplicaFresh(tx, requestedAt, mutate);
}

let persistentStorageRequested = false;

export function requestPersistentDictionaryStorage(): void {
    if (persistentStorageRequested) return;
    persistentStorageRequested = true;
    try {
        void navigator.storage?.persist?.().then(granted => {
            Logger.scope('Yomitan').info('Persistent storage request', { granted });
        }).catch(() => undefined);
    } catch {
        // Optional in older browsers; denial does not prevent an import.
    }
}
