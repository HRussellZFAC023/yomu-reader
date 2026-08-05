import {
    reconcileManagedStateIdbEpoch,
    runManagedStateIdbWrite,
    type ManagedStateIdbWriteOptions,
} from '../../app/managed-indexeddb';
import type { ManagedStateEpoch } from '../../app/managed-state-epoch';
import { assertManagedStateMutationAllowed, assertManagedStateReadAllowed } from '../../app/storage';

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

/**
 * Fence one acquisition of the dictionary database handle.
 *
 * OPENING is a managed-state mutation: it reconciles the epoch record and can
 * clear retired content stores, so it keeps the full mutation fence on both
 * sides of the open. Reusing an already-open handle is a READ, and only has to
 * refuse a realm whose epoch was retired.
 *
 * The store used to take the mutation fence twice on every acquisition. Measured
 * against a warm store: 9 GM round trips per `lookup()` and 9 more per
 * `findTermMatches()` pass, every one of them re-reading `yomu:state-epoch` or
 * `yomu:factory-reset-signal` — two control keys that cannot change without a
 * factory reset. Under Tampermonkey each is an IPC hop to the extension worker,
 * so an annotation sweep over twenty text windows paid ~180 hops before reading
 * a single dictionary row. Every write path in the store (importFile, clearAll,
 * the derived-index builders) already fences itself, so the fence on the reuse
 * path was protecting nothing a reader needs.
 *
 * `open` is passed the epoch and is expected to memoize (`??=`), so a second
 * caller racing the first through the fence reuses the first open.
 *
 * Granularity: one acquisition per LOGICAL read, not per round trip. A window
 * sweep acquires once and threads the handle through its windows, rather than
 * paying a `yomu:state-epoch` read for every window of every sweep. The gate
 * fixture's short sentence is a single window per sweep, so that costs it
 * nothing measurable; the saving scales with the length of the text being
 * annotated, which is where the sweep exists to be cheap. A sweep that started
 * in a live epoch and finishes in a retired one has still only READ; every write
 * it can reach (the derived-index builders, importFile, clearAll) fences itself,
 * so nothing it does can persist.
 */
export async function fencedYomitanDbHandle(
    current: () => Promise<IDBDatabase> | undefined,
    open: (epoch: ManagedStateEpoch) => Promise<IDBDatabase>,
): Promise<IDBDatabase> {
    const existing = current();
    if (existing) {
        await assertManagedStateReadAllowed();
        return existing;
    }
    const db = await open(await assertManagedStateMutationAllowed());
    await assertManagedStateMutationAllowed();
    return db;
}

export function runYomitanManagedStateWrite(
    db: IDBDatabase,
    storeNames: string | string[],
    mutate: (tx: IDBTransaction) => void,
    options?: ManagedStateIdbWriteOptions,
): Promise<void> {
    return runManagedStateIdbWrite(db, MANAGED_STATE_MARKER, storeNames, mutate, options);
}
