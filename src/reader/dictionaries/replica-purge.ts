import { Logger } from '../app/logger';
import { assertManagedStateMutationAllowed, ensureManagedWebStorageCurrent, gmStorageGet, gmStorageSet, managedLocalStorage } from '../app/storage';
import { managedStateEpochToken } from '../app/managed-state-epoch';
import { YOMITAN_DATABASE_NAME } from './yomitan/database-name';

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

/**
 * Never upgrades or deletes a database: no deferred deletion can outlive this
 * call. This origin's marker records the newest request it has checked, as in
 * v1.9.3, so a request it already honoured costs no fence and no open.
 */
export async function honorDictionaryReplicaPurge(): Promise<boolean> {
    const requestedAt = await dictionaryReplicaPurgeRequest();
    if (!requestedAt || typeof indexedDB === 'undefined') return false;
    let token: string;
    try {
        await ensureManagedWebStorageCurrent();
        if (requestedAt <= honoredAt()) return false;
        token = managedStateEpochToken(await assertManagedStateMutationAllowed());
    } catch { return false; }
    const check = await checkDictionaryDatabase(requestedAt, token);
    if (check !== 'retry') recordHonored(requestedAt);
    if (check === 'cleared') log.info('Removed this origin\'s dictionary copy after an all-sites purge');
    return check === 'cleared';
}

function timestamp(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function honoredAt(): number {
    try { return timestamp(managedLocalStorage.getItem(PURGE_HONORED_KEY)); }
    catch { return 0; }
}

function recordHonored(requestedAt: number): void {
    try { managedLocalStorage.setItem(PURGE_HONORED_KEY, String(Math.max(honoredAt(), requestedAt))); }
    catch { /* Without the marker the next visit checks the database again. */ }
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

/** 'cleared' covers an absent database; 'current' a copy imported since the request; 'retry' anything unfinished. */
type PurgeCheck = 'cleared' | 'current' | 'retry';

function checkDictionaryDatabase(requestedAt: number, expectedToken: string): Promise<PurgeCheck> {
    return new Promise(resolve => {
        let settled = false;
        let acquired = false;
        let connection: IDBDatabase | undefined;
        let transaction: IDBTransaction | undefined;
        const finish = (check: PurgeCheck): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            connection?.close();
            resolve(check);
        };
        // Bounds only open/transaction acquisition. Active clears may take much
        // longer on large databases; aborting those every second prevents drain.
        const timeout = setTimeout(() => {
            if (acquired) return;
            try { transaction?.abort(); } catch { /* already settled */ }
            finish('retry');
        }, 1_000);
        try {
            let absent = false;
            const request = indexedDB.open(YOMITAN_DATABASE_NAME);
            request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
            request.onerror = () => finish(absent ? 'cleared' : 'retry');
            request.onblocked = () => finish('retry');
            request.onsuccess = () => {
                const db = request.result;
                if (settled) { db.close(); return; }
                connection = db;
                const names = Array.from(db.objectStoreNames);
                if (!names.length) { finish('cleared'); return; }
                try {
                    const tx = transaction = db.transaction(names, 'readwrite');
                    let cleared = false;
                    tx.oncomplete = () => finish(cleared ? 'cleared' : 'current');
                    tx.onabort = () => finish('retry');
                    tx.onerror = () => { /* abort owns completion and rollback */ };
                    const run = (store?: IDBObjectStore, record?: FreshnessRecord, token: string | null = null) => {
                        if (settled) { tx.abort(); return; }
                        acquired = true;
                        clearTimeout(timeout);
                        if (token !== null && token !== expectedToken) { tx.abort(); return; }
                        // The database record is authoritative once it exists.
                        const prior = record?.token === token ? timestamp(record?.requestedAt) : 0;
                        if (prior >= requestedAt) return;
                        try {
                            for (const name of names) if (name !== STATE_STORE) tx.objectStore(name).clear();
                            store?.put({ key: FRESHNESS_KEY, token, requestedAt, kind: 'purge' });
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
                } catch { finish('retry'); }
            };
        } catch { finish('retry'); }
    });
}
