import { Logger } from '../app/logger';
import { assertManagedStateMutationAllowed, ensureManagedWebStorageCurrent, gmStorageGet, gmStorageSet, managedLocalStorage } from '../app/storage';
import { managedStateEpochToken } from '../app/managed-state-epoch';
import { yomitanDatabaseName } from './yomitan/database-owner';

const log = Logger.scope('DictionaryReplicaPurge');
const PURGE_REQUEST_KEY = 'yomu:dictionary-replica-purge:v1';
const PURGE_HONORED_KEY = 'yomu:dictionary-replica-purged:v1';
const STATE_STORE = 'managedState';
const FRESHNESS_KEY = 'dictionary-replica-purge';

export async function requestDictionaryReplicaPurge(now: () => number = Date.now): Promise<void> {
    // This existing cross-origin GM protocol is wall-clock based. Local IDB
    // serialization does not make concurrent/global request generation atomic.
    await gmStorageSet(PURGE_REQUEST_KEY, now());
}

export async function dictionaryReplicaPurgeRequest(): Promise<number> {
    return timestamp(await gmStorageGet<unknown>(PURGE_REQUEST_KEY, 0));
}

/** Queue ownership and the actual mutation in the same managed IDB transaction. */
export function markDictionaryReplicaFresh(tx: IDBTransaction, requestedAt: number, mutate: () => void): void {
    readFreshness(tx, (store, record, token) => {
        try {
            const prior = record?.token === token ? timestamp(record.requestedAt) : 0;
            if (record?.token === token && record.kind === 'purge' && prior > requestedAt) {
                throw new Error('A newer dictionary purge superseded this import.');
            }
            store.put({ key: FRESHNESS_KEY, token, requestedAt: Math.max(prior, requestedAt), kind: 'import' });
            mutate();
        } catch { tx.abort(); }
    });
}

/** Never upgrades or deletes a database: no deferred deletion can outlive this call. */
export async function honorDictionaryReplicaPurge(): Promise<boolean> {
    const requestedAt = await dictionaryReplicaPurgeRequest();
    if (!requestedAt || typeof indexedDB === 'undefined') return false;
    let token: string;
    try {
        await ensureManagedWebStorageCurrent();
        token = managedStateEpochToken(await assertManagedStateMutationAllowed());
    } catch { return false; }
    const cleared = await clearDictionaryDatabase(requestedAt, token);
    if (cleared) log.info('Removed this origin\'s dictionary copy after an all-sites purge');
    return cleared;
}

function timestamp(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function legacyHonoredAt(): number {
    try { return timestamp(managedLocalStorage.getItem(PURGE_HONORED_KEY)); }
    catch { return 0; }
}

interface FreshnessRecord { requestedAt?: unknown; token?: unknown; kind?: unknown }

function readFreshness(tx: IDBTransaction, ready: (store: IDBObjectStore, record: FreshnessRecord | undefined, token: string | null) => void): void {
    const store = tx.objectStore(STATE_STORE);
    const epoch = store.get('epoch');
    epoch.onsuccess = () => {
        const token = typeof epoch.result?.token === 'string' ? epoch.result.token : null;
        const request = store.get(FRESHNESS_KEY);
        request.onsuccess = () => ready(store, request.result, token);
    };
}

function clearDictionaryDatabase(requestedAt: number, expectedToken: string): Promise<boolean> {
    return new Promise(resolve => {
        let settled = false;
        let acquired = false;
        let connection: IDBDatabase | undefined;
        let transaction: IDBTransaction | undefined;
        const finish = (cleared: boolean): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            connection?.close();
            resolve(cleared);
        };
        // Bounds only open/transaction acquisition. Active clears may take much
        // longer on large databases; aborting those every second prevents drain.
        const timeout = setTimeout(() => {
            if (acquired) return;
            try { transaction?.abort(); } catch { /* already settled */ }
            finish(false);
        }, 1_000);
        try {
            let absent = false;
            const request = indexedDB.open(yomitanDatabaseName());
            request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
            request.onerror = () => finish(absent);
            request.onblocked = () => finish(false);
            request.onsuccess = () => {
                const db = request.result;
                if (settled) { db.close(); return; }
                connection = db;
                const names = Array.from(db.objectStoreNames);
                if (!names.length) { finish(true); return; }
                try {
                    const tx = transaction = db.transaction(names, 'readwrite');
                    let cleared = false;
                    tx.oncomplete = () => {
                        if (cleared && !names.includes(STATE_STORE)) {
                            try { managedLocalStorage.setItem(PURGE_HONORED_KEY, String(Math.max(legacyHonoredAt(), requestedAt))); } catch { /* legacy hints are optional */ }
                        }
                        finish(cleared);
                    };
                    tx.onabort = () => finish(false);
                    tx.onerror = () => { /* abort owns completion and rollback */ };
                    const run = (store?: IDBObjectStore, record?: FreshnessRecord, token: string | null = null) => {
                        if (settled) { tx.abort(); return; }
                        acquired = true;
                        clearTimeout(timeout);
                        if (token !== null && token !== expectedToken) { tx.abort(); return; }
                        // The DB marker is authoritative. The old local marker is
                        // consulted only when adopting a pre-marker database.
                        const legacy = record === undefined ? legacyHonoredAt() : 0;
                        const prior = record ? (record.token === token ? timestamp(record.requestedAt) : 0) : Math.min(legacy, requestedAt);
                        if (!record && legacy >= requestedAt) {
                            // Consume a legacy wall-clock exemption once, at the
                            // actual request being adopted, never at its future date.
                            if (store) store.put({ key: FRESHNESS_KEY, token, requestedAt, kind: 'import' });
                            else {
                                tx.addEventListener('complete', () => {
                                    try { managedLocalStorage.setItem(PURGE_HONORED_KEY, String(requestedAt)); } catch { /* hint only */ }
                                });
                            }
                        }
                        if (prior >= requestedAt) return;
                        try {
                            for (const name of names) if (name !== STATE_STORE) tx.objectStore(name).clear();
                            store?.put({ key: FRESHNESS_KEY, token, requestedAt: Math.max(prior, requestedAt), kind: 'purge' });
                            cleared = true;
                        } catch { tx.abort(); }
                    };
                    // Stop acquisition timing at the first scheduled request,
                    // rather than counting metadata reads or store.clear work.
                    const first = tx.objectStore(names[0]!).get(FRESHNESS_KEY);
                    first.onsuccess = () => {
                        if (settled) { tx.abort(); return; }
                        acquired = true;
                        clearTimeout(timeout);
                        if (names.includes(STATE_STORE)) readFreshness(tx, run);
                        else run();
                    };
                } catch { finish(false); }
            };
        } catch { finish(false); }
    });
}
