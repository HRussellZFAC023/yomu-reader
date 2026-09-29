import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    installFreshManagedStateEpochSessionForTests, MANAGED_STATE_EPOCH_KEY,
    nextManagedStateEpoch, parseManagedStateEpoch,
} from '../../src/reader/app/managed-state-epoch';

const DATABASE = 'yomu-practice-sessions-v1-userscript-v2';
const TAB_KEY = 'yomu:practice-session-tab:v1';
const selection = {
    purpose: 'writing' as const, title: 'Reset fence',
    material: [{ id: 'water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water' }],
};

// Only the external GM backend and IDB event timing are controlled. All epoch,
// suppression, session, transaction, and purge implementations remain real.
describe('practice session reset fences', () => {
    let factory: IDBFactory;
    let values: Map<string, unknown>;
    let registry: typeof import('../../src/reader/app/managed-state-registry');
    let storage: typeof import('../../src/reader/app/storage');
    let sessions: InstanceType<typeof import('../../src/reader/study/practice-session').PracticeSessions>;

    beforeEach(async () => {
        vi.resetModules();
        installFreshManagedStateEpochSessionForTests();
        localStorage.clear();
        sessionStorage.clear();
        factory = new IDBFactory();
        values = new Map();
        vi.stubGlobal('indexedDB', factory);
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback);
        vi.stubGlobal('GM_setValue', (key: string, value: unknown) => { values.set(key, value); });
        vi.stubGlobal('GM_deleteValue', (key: string) => { values.delete(key); });
        vi.stubGlobal('GM_listValues', () => [...values.keys()]);
        storage = await import('../../src/reader/app/storage');
        registry = await import('../../src/reader/app/managed-state-registry');
        registry.endManagedStateReset();
        const { PracticeSessions } = await import('../../src/reader/study/practice-session');
        sessions = new PracticeSessions(factory);
    });

    afterEach(() => {
        registry?.endManagedStateReset();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
        vi.resetModules();
    });

    function remoteReset() {
        const epoch = nextManagedStateEpoch(parseManagedStateEpoch(values.get(MANAGED_STATE_EPOCH_KEY)), 'remote-reset');
        values.set(MANAGED_STATE_EPOCH_KEY, epoch);
        return epoch;
    }

    async function freshSessions() {
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const { PracticeSessions } = await import('../../src/reader/study/practice-session');
        return new PracticeSessions(factory);
    }

    it('rejects stale resume/list/start and checkpoint writes after a remote epoch change', async () => {
        const session = await sessions.start(selection);
        const before = await physicalRows(factory);
        remoteReset();
        await expect(sessions.list()).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
        await expect(sessions.resume(session.view().id)).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
        await expect(sessions.start(selection)).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
        await expect(session.dispatch({ kind: 'draft', text: 'late', turn: session.view().turn }))
            .resolves.toMatchObject({ kind: 'rejected', reason: 'storage' });
        expect(await physicalRows(factory)).toEqual(before);
        const fresh = await freshSessions();
        expect(await fresh.list()).toEqual([]);
        await expect(fresh.resume(session.view().id)).rejects.toThrow('could not be restored');
        const current = await fresh.start(selection);
        expect((await fresh.list()).map(row => row.id)).toEqual([current.view().id]);
        // Old imported storage retains its captured epoch even after a fresh realm starts.
        await expect(session.dispatch({ kind: 'reveal', turn: session.view().turn }))
            .resolves.toMatchObject({ kind: 'rejected', reason: 'storage' });
        expect((await fresh.resume(current.view().id)).view().current?.response.draft).toBe('');
    });

    it.each(['resume', 'write', 'start'] as const)('rechecks the epoch after a delayed %s database open', async operation => {
        const session = await sessions.start(selection);
        const before = await physicalRows(factory);
        const gate = delayNextOpen(factory);
        const pending = operation === 'resume' ? sessions.resume(session.view().id)
            : operation === 'start' ? sessions.start(selection)
                : session.dispatch({ kind: 'draft', text: 'late', turn: session.view().turn });
        // Attach rejection handling before advancing the reset boundary.
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        try {
            await gate.ready;
            remoteReset();
        } finally { gate.release(); }
        if (operation === 'write') expect(await outcome).toMatchObject({ value: { kind: 'rejected', reason: 'storage' } });
        else expect(await outcome).toMatchObject({ error: { name: 'StaleManagedStateEpochError' } });
        expect(await physicalRows(factory)).toEqual(before);
        expect(await (await freshSessions()).list()).toEqual([]);
    });

    it('aborts a checkpoint when suppression begins after the transaction read', async () => {
        const session = await sessions.start(selection);
        const before = await physicalRows(factory);
        let reachedBoundary = false;
        const original = IDBObjectStore.prototype.get;
        vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, key) {
            const request = original.call(this, key);
            if (this.name === 'sessions' && this.transaction.mode === 'readwrite') {
                request.addEventListener('success', () => {
                    reachedBoundary = true;
                    registry.beginManagedStateReset();
                }, { once: true });
            }
            return request;
        });
        expect(await session.dispatch({ kind: 'draft', text: 'interrupted', turn: session.view().turn }))
            .toMatchObject({ kind: 'rejected', reason: 'storage' });
        expect(reachedBoundary).toBe(true);
        expect(await physicalRows(factory)).toEqual(before);
        // Suppression must not itself make a valid readonly snapshot inaccessible.
        expect((await sessions.resume(session.view().id)).view().current?.response.draft).toBe('');
    });

    it.each(['write', 'start'] as const)('blocks a delayed %s open when reset suppression begins', async operation => {
        const session = await sessions.start(selection);
        const before = await physicalRows(factory);
        const gate = delayNextOpen(factory);
        const pending = operation === 'start' ? sessions.start(selection)
            : session.dispatch({ kind: 'draft', text: 'suppressed', turn: session.view().turn });
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        try {
            await gate.ready;
            registry.beginManagedStateReset();
        } finally { gate.release(); }
        if (operation === 'write') expect(await outcome).toMatchObject({ value: { kind: 'rejected', reason: 'storage' } });
        else expect(await outcome).toMatchObject({ error: expect.any(Error) });
        expect(await physicalRows(factory)).toEqual(before);
        registry.endManagedStateReset();
        expect((await sessions.resume(session.view().id)).view().current?.response.draft).toBe('');
    });

    it('keeps a late transaction in its retired generation when a remote reset misses local suppression', async () => {
        const session = await sessions.start(selection);
        let reachedBoundary = false;
        const original = IDBObjectStore.prototype.get;
        vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, key) {
            const request = original.call(this, key);
            if (this.name === 'sessions' && this.transaction.mode === 'readwrite' && !reachedBoundary) {
                request.addEventListener('success', () => { reachedBoundary = true; remoteReset(); }, { once: true });
            }
            return request;
        });
        await session.dispatch({ kind: 'draft', text: 'retired', turn: session.view().turn });
        expect(reachedBoundary).toBe(true);
        const rows = await physicalRows(factory);
        expect(rows.sessions.every(row => row.epoch === '0:legacy')).toBe(true);
        expect(rows.material.every(row => row.epoch === '0:legacy')).toBe(true);
        const fresh = await freshSessions();
        expect(await fresh.list()).toEqual([]);
        await expect(fresh.resume(session.view().id)).rejects.toThrow('could not be restored');
        const current = await fresh.start(selection);
        expect((await fresh.list()).map(row => row.id)).toEqual([current.view().id]);
    });

    it('purges the registered database and tab pointer and fences the old session after epoch commit', async () => {
        const session = await sessions.start(selection);
        await storage.ensureManagedWebStorageCurrent();
        storage.managedSessionStorage.setItem(TAB_KEY, JSON.stringify({ version: 1, sessionId: session.view().id }));
        expect(registry.managedStateEntries()).toEqual(expect.arrayContaining([
            { owner: 'study/practice-session', kind: 'idb', key: DATABASE },
            { owner: 'study/practice-session', kind: 'session', key: TAB_KEY },
        ]));
        expect((await factory.databases()).some(db => db.name === DATABASE)).toBe(true);
        registry.beginManagedStateReset();
        await storage.clearManagedStoredValues();
        expect((await factory.databases()).some(db => db.name === DATABASE)).toBe(false);
        expect(sessionStorage.getItem(TAB_KEY)).toBeNull();
        await storage.commitManagedStateResetEpoch('purge-reset');
        registry.endManagedStateReset();
        expect(await session.dispatch({ kind: 'reveal', turn: session.view().turn }))
            .toMatchObject({ kind: 'rejected', reason: 'storage' });
        expect((await factory.databases()).some(db => db.name === DATABASE)).toBe(false);
        expect(await (await freshSessions()).list()).toEqual([]);
        expect(await physicalRows(factory)).toEqual({ sessions: [], material: [] });
    });
});

async function physicalRows(factory: IDBFactory): Promise<{ sessions: Record<string, unknown>[]; material: Record<string, unknown>[] }> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DATABASE, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(['sessions', 'material'], 'readonly');
            const sessions = transaction.objectStore('sessions').getAll();
            const material = transaction.objectStore('material').getAll();
            transaction.oncomplete = () => resolve({ sessions: sessions.result, material: material.result });
            transaction.onabort = () => reject(transaction.error);
        });
    } finally { db.close(); }
}

/** Delay notification only: the underlying open and every transaction are real. */
function delayNextOpen(factory: IDBFactory) {
    let release!: () => void;
    let opened!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { opened = resolve; });
    const original = factory.open.bind(factory);
    vi.spyOn(factory, 'open').mockImplementationOnce((name, version) => {
        const request = original(name, version);
        return new Proxy(request, {
            get(target, property) { return Reflect.get(target, property, target); },
            set(target, property, value) {
                if (property === 'onsuccess') {
                    target.onsuccess = event => {
                        opened();
                        void released.then(() => value.call(request, event));
                    };
                    return true;
                }
                return Reflect.set(target, property, value, target);
            },
        });
    });
    return { ready, release };
}
