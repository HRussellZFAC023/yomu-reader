import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
    honorDictionaryReplicaPurge,
    markDictionaryReplicaFresh,
    requestDictionaryReplicaPurge,
} from '../../src/reader/dictionaries/replica-purge';

const DB_NAME = 'jpdb-popup-reader-yomitan-userscript-v2';
const gmValues = new Map<string, unknown>();

function installGmShim(): void {
    (globalThis as Record<string, unknown>).GM_getValue = (key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback;
    (globalThis as Record<string, unknown>).GM_setValue = (key: string, value: unknown) => { gmValues.set(key, value); };
    (globalThis as Record<string, unknown>).GM_deleteValue = (key: string) => { gmValues.delete(key); };
    (globalThis as Record<string, unknown>).GM_listValues = () => [...gmValues.keys()];
}

function createDictionaryDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('terms');
            request.result.createObjectStore('managedState', { keyPath: 'key' });
        };
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('terms', 'readwrite');
            transaction.objectStore('terms').put('old dictionary', 'old');
            transaction.oncomplete = () => { db.close(); resolve(); };
            transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
        request.onerror = () => reject(request.error);
    });
}

function databaseExists(): Promise<boolean> {
    return new Promise(resolve => {
        let existed = true;
        const request = indexedDB.open(DB_NAME);
        request.onupgradeneeded = () => { existed = false; };
        request.onsuccess = () => {
            request.result.close();
            if (!existed) indexedDB.deleteDatabase(DB_NAME);
            resolve(existed);
        };
        request.onerror = () => resolve(false);
    });
}

function deleteDatabase(): Promise<void> {
    return new Promise(resolve => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

async function termCount(): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('terms', 'readonly');
            const count = transaction.objectStore('terms').count();
            transaction.oncomplete = () => { db.close(); resolve(count.result); };
            transaction.onerror = () => { db.close(); reject(transaction.error); };
        };
        request.onerror = () => reject(request.error);
    });
}

async function importFresh(requestedAt: number, abort = false): Promise<void> {
    const db = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['terms', 'managedState'], 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(new Error('Import aborted'));
            markDictionaryReplicaFresh(tx, requestedAt, () => {
                tx.objectStore('terms').put('newly imported learner dictionary', 'fresh');
                if (abort) tx.abort();
            });
        });
    } finally { db.close(); }
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function freshness(): Promise<unknown> {
    const db = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('managedState');
            const request = tx.objectStore('managedState').get('dictionary-replica-purge');
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
}

beforeEach(() => {
    gmValues.clear();
    localStorage.clear();
    installGmShim();
});

afterEach(async () => {
    await deleteDatabase();
    delete (globalThis as Record<string, unknown>).GM_getValue;
    delete (globalThis as Record<string, unknown>).GM_setValue;
    delete (globalThis as Record<string, unknown>).GM_deleteValue;
    delete (globalThis as Record<string, unknown>).GM_listValues;
});

describe('dictionary replica purge', () => {
    it('does not create a dictionary database merely to honor cleanup', async () => {
        await requestDictionaryReplicaPurge(() => 1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(databaseExists()).resolves.toBe(false);
    });

    it('abandons a slow open without clearing data when the open eventually succeeds', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1_000);
        const late = {} as IDBOpenDBRequest;
        const open = vi.spyOn(indexedDB, 'open').mockReturnValue(late);
        vi.useFakeTimers();
        try {
            const pending = honorDictionaryReplicaPurge();
            await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
            await vi.advanceTimersByTimeAsync(1_000);
            await expect(pending).resolves.toBe(false);
            open.mockRestore();
            vi.useRealTimers();
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(DB_NAME);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            Object.assign(late, { result: db });
            late.onsuccess?.call(late, new Event('success'));
            await expect(termCount()).resolves.toBe(1);
        } finally { open.mockRestore(); vi.useRealTimers(); }
    });

    it('rolls back all clears if a store cannot be cleared, then permits a retry', async () => {
        await createDictionaryDatabase();
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2);
            request.onupgradeneeded = () => request.result.createObjectStore('termMeta');
            request.onsuccess = () => { request.result.close(); resolve(); };
            request.onerror = () => reject(request.error);
        });
        await requestDictionaryReplicaPurge(() => 1_000);
        const clear = IDBObjectStore.prototype.clear;
        const spy = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
            if (this.name === 'terms') throw new Error('simulated store failure');
            return clear.call(this);
        });
        try { await expect(honorDictionaryReplicaPurge()).resolves.toBe(false); }
        finally { spy.mockRestore(); }
        await expect(termCount()).resolves.toBe(1);
        expect(await freshness()).toBeUndefined();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(termCount()).resolves.toBe(0);
    });

    it('does nothing when no purge was requested', async () => {
        await createDictionaryDatabase();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
    });

    it('clears this origin\'s records once per request while retaining its schema', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(termCount()).resolves.toBe(0);
        // Honored: the same request never fires again on this origin.
        await createDictionaryDatabase();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
        await expect(termCount()).resolves.toBe(1);
    });

    it('honors a newer request after an earlier one was honored', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 2_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(termCount()).resolves.toBe(0);
    });

    it('never deletes a dictionary imported after the purge', async () => {
        await requestDictionaryReplicaPurge(() => 1_000);
        // A first-visit-after-purge import on this origin: the import stamps
        // freshness, so the pending purge must not remove it.
        await createDictionaryDatabase();
        await importFresh(1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
    });

    it('does not let a future-dated import suppress a later explicit purge', async () => {
        await requestDictionaryReplicaPurge(() => 1_000);
        const clock = vi.spyOn(Date, 'now').mockReturnValue(99_000);
        await createDictionaryDatabase();
        try { await importFresh(1_000); } finally { clock.mockRestore(); }
        await requestDictionaryReplicaPurge(() => 2_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(termCount()).resolves.toBe(0);
    });

    it('does not leave a blocked deletion that erases a later import after reporting no deletion', async () => {
        await createDictionaryDatabase();
        const connection = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            await requestDictionaryReplicaPurge(() => 1_000);
            await honorDictionaryReplicaPurge();
            await new Promise<void>((resolve, reject) => {
                const transaction = connection.transaction('terms', 'readwrite');
                transaction.objectStore('terms').put('newly imported learner dictionary', 'fresh');
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
            await importFresh(1_000);
        } finally { connection.close(); }
        await expect(databaseExists()).resolves.toBe(true);
        const retained = await new Promise<unknown>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction('terms', 'readonly');
                const read = transaction.objectStore('terms').get('fresh');
                transaction.oncomplete = () => { db.close(); resolve(read.result); };
                transaction.onerror = () => { db.close(); reject(transaction.error); };
            };
            request.onerror = () => reject(request.error);
        });
        expect(retained).toBe('newly imported learner dictionary');
    });

    it('serializes stale and newer imports on separate connections without regressing freshness', async () => {
        await createDictionaryDatabase();
        // Tab A captured 100 before pausing; tab B imports against request 200.
        await importFresh(200);
        await importFresh(100);
        expect(await freshness()).toMatchObject({ requestedAt: 200, kind: 'import' });
        await requestDictionaryReplicaPurge(() => 200);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        expect(await termCount()).toBe(2);
    });

    it('rolls back freshness and content when the import transaction aborts', async () => {
        await createDictionaryDatabase();
        await expect(importFresh(200, true)).rejects.toThrow('Import aborted');
        expect(await freshness()).toBeUndefined();
        expect(await termCount()).toBe(1);
        await requestDictionaryReplicaPurge(() => 200);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
    });

    it('does not resurrect a stale import after a newer purge committed', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 200);
        await honorDictionaryReplicaPurge();
        await expect(importFresh(100)).rejects.toThrow('Import aborted');
        expect(await termCount()).toBe(0);
        expect(await freshness()).toMatchObject({ requestedAt: 200, kind: 'purge' });
    });

    it('does not let a standalone purge hint exempt an installed dictionary', async () => {
        await createDictionaryDatabase();
        localStorage.setItem('yomu:dictionary-replica-purged:v1', '99000');
        await requestDictionaryReplicaPurge(() => 1000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        expect(await freshness()).toMatchObject({ requestedAt: 1000, kind: 'purge' });
        expect(await termCount()).toBe(0);
        expect(localStorage.getItem('yomu:dictionary-replica-purged:v1')).toBe('99000');
        await requestDictionaryReplicaPurge(() => 2000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        expect(await termCount()).toBe(0);
    });

    it('uses a point query, never count, and allows an acquired clear past the deadline', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1000);
        const count = vi.spyOn(IDBObjectStore.prototype, 'count');
        const original = IDBObjectStore.prototype.clear;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const clear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
            vi.advanceTimersByTime(2000);
            return original.call(this);
        });
        try {
            await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
            expect(count).not.toHaveBeenCalled();
        } finally { clear.mockRestore(); count.mockRestore(); vi.useRealTimers(); }
        expect(await termCount()).toBe(0);
    });

    it('aborts a queued transaction on acquisition timeout without a later destructive clear', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1000);
        const db = await openDatabase();
        const lock = db.transaction(['terms', 'managedState'], 'readwrite');
        let holding = true;
        const keepAlive = () => {
            const read = lock.objectStore('terms').get('old');
            read.onsuccess = () => { if (holding) keepAlive(); };
        };
        keepAlive();
        const released = new Promise<void>(resolve => { lock.oncomplete = () => resolve(); });
        const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            const pending = honorDictionaryReplicaPurge();
            await vi.waitFor(() => expect(transaction).toHaveBeenCalled());
            await vi.advanceTimersByTimeAsync(1000);
            await expect(pending).resolves.toBe(false);
        } finally {
            holding = false;
            vi.useRealTimers();
            transaction.mockRestore();
            await released;
            db.close();
        }
        expect(await termCount()).toBe(1);
        expect(await freshness()).toBeUndefined();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
    });
});
