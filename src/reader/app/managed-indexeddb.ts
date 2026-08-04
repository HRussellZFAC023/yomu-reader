import {
    managedStateEpochToken,
    managedStateEpochTokenRelation,
    type ManagedStateEpoch,
} from './managed-state-epoch';
import { assertManagedStateMutationAllowed } from './storage';

interface ManagedStateIdbRecordDeletion {
    readonly storeName: string;
    readonly key: IDBValidKey;
}

export interface ManagedStateIdbMarker {
    readonly storeName: string;
    readonly key: IDBValidKey;
}

interface ManagedStateIdbEpochOptions {
    readonly label: string;
    readonly markerStoreName: string;
    readonly markerKey: IDBValidKey;
    readonly markerKeyPath: string;
    readonly clearedStoreNames: readonly string[];
    readonly deletedRecords?: readonly ManagedStateIdbRecordDeletion[];
}

export interface ManagedStateIdbWriteOptions {
    readonly durability?: 'default' | 'strict' | 'relaxed';
}

export async function reconcileManagedStateIdbEpoch(
    db: IDBDatabase,
    epoch: ManagedStateEpoch,
    options: ManagedStateIdbEpochOptions,
): Promise<void> {
    const token = managedStateEpochToken(epoch);
    const transactionStores = [...new Set([
        options.markerStoreName,
        ...options.clearedStoreNames,
        ...(options.deletedRecords ?? []).map(record => record.storeName),
    ])];
    let reconciliationError: Error | undefined;
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(transactionStores, 'readwrite');
        const markerStore = tx.objectStore(options.markerStoreName);
        const request = markerStore.get(options.markerKey);
        request.onsuccess = () => {
            const record = request.result as unknown;
            const markerMissing = record === undefined;
            if (!markerMissing && (!record || typeof record !== 'object' || Array.isArray(record)
                || typeof (record as { token?: unknown }).token !== 'string')) {
                reconciliationError = managedStateIdbEpochError(options.label, 'malformed');
                return;
            }
            const storedToken = markerMissing ? undefined : (record as { token: string }).token;
            if (storedToken === token) return;
            if (storedToken !== undefined) {
                const relation = managedStateEpochTokenRelation(storedToken, epoch);
                if (relation === 'newer' || relation === 'conflict' || relation === 'malformed') {
                    reconciliationError = managedStateIdbEpochError(options.label, relation);
                    return;
                }
            }
            // A missing marker is a schema adoption, never a wipe. Databases
            // written before the marker store existed carry data the learner
            // may have imported long after their last factory reset — clearing
            // them on `generation > 0` silently destroyed every dictionary for
            // anyone who had ever reset. Reset does not rely on this marker for
            // the origin it runs on (it deletes the database outright), and
            // databases written since the marker shipped carry one, so a stale
            // post-reset copy still clears through the stored-token branch.
            if (storedToken !== undefined) {
                for (const storeName of options.clearedStoreNames) tx.objectStore(storeName).clear();
                for (const record of options.deletedRecords ?? []) tx.objectStore(record.storeName).delete(record.key);
            }
            markerStore.put({ [options.markerKeyPath]: options.markerKey, token });
        };
        request.onerror = () => reject(request.error ?? new Error(`Could not read ${options.label} epoch.`));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Could not reconcile ${options.label} epoch.`));
        tx.onabort = () => reject(tx.error ?? new Error(`Could not reconcile ${options.label} epoch.`));
    });
    if (reconciliationError) throw reconciliationError;
    await assertManagedStateMutationAllowed();
}

export async function runManagedStateIdbWrite(
    db: IDBDatabase,
    marker: ManagedStateIdbMarker,
    storeNames: string | string[],
    mutate: (tx: IDBTransaction) => void,
    options: ManagedStateIdbWriteOptions = {},
): Promise<void> {
    const epoch = await assertManagedStateMutationAllowed();
    const transactionStores = [...new Set([
        marker.storeName,
        ...(typeof storeNames === 'string' ? [storeNames] : storeNames),
    ])];
    const tx = managedStateIdbTransaction(db, transactionStores, options.durability);
    const done = idbTransactionDone(tx);
    let mutationError: unknown;
    const markerRequest = tx.objectStore(marker.storeName).get(marker.key);
    markerRequest.onsuccess = () => {
        try {
            assertManagedStateIdbMarker(markerRequest.result, epoch);
            mutate(tx);
        } catch (error) {
            mutationError = error;
            try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
        }
    };
    try {
        await done;
    } catch (error) {
        throw mutationError ?? error;
    }
    if (mutationError) throw mutationError;
    await assertManagedStateMutationAllowed();
}

function managedStateIdbTransaction(
    db: IDBDatabase,
    storeNames: string | string[],
    durability?: ManagedStateIdbWriteOptions['durability'],
): IDBTransaction {
    if (!durability) return db.transaction(storeNames, 'readwrite');
    try {
        return db.transaction(storeNames, 'readwrite', { durability });
    } catch {
        return db.transaction(storeNames, 'readwrite');
    }
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Managed IndexedDB write failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('Managed IndexedDB write aborted.'));
    });
}

function managedStateIdbEpochError(label: string, relation: 'newer' | 'conflict' | 'malformed'): Error {
    if (relation === 'newer') return new Error(`${label} belongs to a newer managed-state epoch.`);
    if (relation === 'conflict') return new Error(`${label} has a conflicting managed-state epoch.`);
    return new Error(`${label} has a malformed managed-state epoch.`);
}

function assertManagedStateIdbMarker(record: unknown, epoch: ManagedStateEpoch): void {
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || typeof (record as { token?: unknown }).token !== 'string') {
        throw new Error('Managed IndexedDB epoch marker is missing or malformed.');
    }
    const storedToken = (record as { token: string }).token;
    if (storedToken !== managedStateEpochToken(epoch)) {
        throw new Error(`Managed IndexedDB epoch marker is stale (${storedToken}).`);
    }
}
