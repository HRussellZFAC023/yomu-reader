import { assertManagedStateMutationAllowed, assertManagedStateReadAllowed } from '../app/storage';
import { managedStateEpochToken } from '../app/managed-state-epoch';
import { managedStateWritesSuppressed } from '../app/managed-state-registry';
import type { PracticeSessionRecord } from './practice-session';

export const PRACTICE_SESSION_DATABASE = 'yomu-practice-sessions-v1';

export class PracticeSessionConflict extends Error {
    constructor() { super('The practice session changed in another window.'); }
}

/** One transaction compares the saved revision and publishes the whole checkpoint. */
export class PracticeSessionStore {
    constructor(private readonly factory: IDBFactory = indexedDB) {}

    async read(id: string): Promise<unknown> {
        const epoch = managedStateEpochToken(await assertManagedStateReadAllowed());
        return this.transaction('readonly', async (store, material) => {
            const checkpoint = await requestValue(store.get([epoch, id]));
            if (checkpoint === undefined) return undefined;
            const prepared = await requestValue(material.get([epoch, id]));
            if (!Array.isArray(prepared?.items) || prepared.items.length !== checkpoint.itemCount
                || !Array.isArray(prepared.material) || prepared.material.length !== checkpoint.materialCount) {
                throw new Error('Practice material is incomplete.');
            }
            return { ...checkpoint, items: prepared.items, material: prepared.material };
        });
    }

    async list(): Promise<unknown[]> {
        const epoch = managedStateEpochToken(await assertManagedStateReadAllowed());
        return this.transaction('readonly', store => requestValue(store.index('epoch').getAll(epoch)));
    }

    async write(record: PracticeSessionRecord, previousRevision: number | null): Promise<void> {
        const epoch = managedStateEpochToken(await assertManagedStateMutationAllowed());
        await this.transaction('readwrite', async (store, material) => {
            if (managedStateWritesSuppressed()) throw new Error('Practice saving is paused during reset.');
            const previous = await requestValue(store.get([epoch, record.id]));
            if (previousRevision === null ? previous !== undefined
                : previous?.revision !== previousRevision || previous?.version !== record.version || previous?.purpose !== record.purpose) {
                throw new PracticeSessionConflict();
            }
            if (managedStateWritesSuppressed()) throw new Error('Practice saving is paused during reset.');
            const { items, material: original, ...checkpoint } = record;
            if (previousRevision === null) await requestValue(material.put({ epoch, id: record.id, items, material: original }));
            await requestValue(store.put({ ...checkpoint, epoch, itemCount: items.length, materialCount: original.length }));
        });
    }

    private async transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, material: IDBObjectStore) => Promise<T>): Promise<T> {
        const db = await this.open();
        try {
            if (mode === 'readwrite') await assertManagedStateMutationAllowed();
            else await assertManagedStateReadAllowed();
            const transaction = db.transaction(['sessions', 'material'], mode);
            let result: T;
            let failure: unknown;
            return await new Promise<T>((resolve, reject) => {
                transaction.oncomplete = () => resolve(result);
                transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Practice storage was interrupted.'));
                transaction.onerror = () => { failure ??= transaction.error; };
                void run(transaction.objectStore('sessions'), transaction.objectStore('material')).then(value => { result = value; }).catch(error => {
                    failure = error;
                    try { transaction.abort(); } catch { /* The request may already have aborted it. */ }
                });
            });
        } finally { db.close(); }
    }

    private open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const request = this.factory.open(PRACTICE_SESSION_DATABASE, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore('sessions', { keyPath: ['epoch', 'id'] });
                store.createIndex('epoch', 'epoch');
                request.result.createObjectStore('material', { keyPath: ['epoch', 'id'] });
            };
            request.onerror = () => { settled = true; reject(request.error ?? new Error('Practice storage is unavailable.')); };
            request.onblocked = () => { settled = true; reject(new Error('Practice storage is busy in another window.')); };
            request.onsuccess = () => {
                if (settled) { request.result.close(); return; }
                settled = true;
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        });
    }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Practice storage request failed.'));
    });
}
