import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
    honorDictionaryReplicaPurge,
    markDictionaryReplicaFresh,
    requestDictionaryReplicaPurge,
} from '../../src/reader/dictionaries/replica-purge';

const DB_NAME = 'jpdb-popup-reader-yomitan';
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
        request.onupgradeneeded = () => request.result.createObjectStore('terms');
        request.onsuccess = () => { request.result.close(); resolve(); };
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
    it('does nothing when no purge was requested', async () => {
        await createDictionaryDatabase();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
    });

    it('deletes this origin\'s copy once per request', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(databaseExists()).resolves.toBe(false);
        // Honored: the same request never fires again on this origin.
        await createDictionaryDatabase();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
    });

    it('honors a newer request after an earlier one was honored', async () => {
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 1_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await createDictionaryDatabase();
        await requestDictionaryReplicaPurge(() => 2_000);
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(true);
        await expect(databaseExists()).resolves.toBe(false);
    });

    it('never deletes a dictionary imported after the purge', async () => {
        await requestDictionaryReplicaPurge(() => 1_000);
        // A first-visit-after-purge import on this origin: the import stamps
        // freshness, so the pending purge must not remove it.
        await markDictionaryReplicaFresh(() => 2_000);
        await createDictionaryDatabase();
        await expect(honorDictionaryReplicaPurge()).resolves.toBe(false);
        await expect(databaseExists()).resolves.toBe(true);
    });
});
