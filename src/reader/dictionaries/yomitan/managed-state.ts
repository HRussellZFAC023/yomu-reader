import {
    reconcileManagedStateIdbEpoch,
    runManagedStateIdbWrite,
    type ManagedStateIdbWriteOptions,
} from '../../app/managed-indexeddb';
import type { ManagedStateEpoch } from '../../app/managed-state-epoch';

const MANAGED_STATE_STORE = 'managedState';
const MANAGED_STATE_EPOCH_RECORD_KEY = 'epoch';
const MANAGED_STATE_MARKER = { storeName: MANAGED_STATE_STORE, key: MANAGED_STATE_EPOCH_RECORD_KEY } as const;
const CONTENT_STORES = [
    'terms',
    'kanji',
    'termMeta',
    'kanjiMeta',
    'dictionaryInfo',
    'termSearch',
    'termKanji',
] as const;

export function ensureYomitanManagedStateStore(db: IDBDatabase): void {
    if (!db.objectStoreNames.contains(MANAGED_STATE_STORE)) {
        db.createObjectStore(MANAGED_STATE_STORE, { keyPath: 'key' });
    }
}

export function reconcileYomitanManagedStateEpoch(db: IDBDatabase, epoch: ManagedStateEpoch): Promise<void> {
    return reconcileManagedStateIdbEpoch(db, epoch, {
        label: 'Dictionary database',
        markerStoreName: MANAGED_STATE_STORE,
        markerKey: MANAGED_STATE_EPOCH_RECORD_KEY,
        markerKeyPath: 'key',
        clearedStoreNames: CONTENT_STORES.filter(storeName => db.objectStoreNames.contains(storeName)),
    });
}

export function runYomitanManagedStateWrite(
    db: IDBDatabase,
    storeNames: string | string[],
    mutate: (tx: IDBTransaction) => void,
    options?: ManagedStateIdbWriteOptions,
): Promise<void> {
    return runManagedStateIdbWrite(db, MANAGED_STATE_MARKER, storeNames, mutate, options);
}
