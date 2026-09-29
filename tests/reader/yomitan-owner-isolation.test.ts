import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { yomitanZipBlob } from './zip-fixture';

const stores: YomitanDictionaryStore[] = [];
afterEach(async () => {
    for (const store of stores.splice(0)) await store.invalidateForFactoryReset();
    vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
});

it.each(['pending-handle', 'opening'] as const)('rejects owner takeover while acquiring a %s', async phase => {
    const store = new YomitanDictionaryStore();
    stores.push(store);
    const internal = store as unknown as {
        dbPromise?: Promise<IDBDatabase>;
        db(): Promise<IDBDatabase>;
        openDb(): Promise<IDBDatabase>;
    };
    let resolve!: (db: IDBDatabase) => void;
    const pending = new Promise<IDBDatabase>(done => { resolve = done; });
    let reachedHandle!: () => void;
    const awaitingHandle = new Promise<void>(done => { reachedHandle = done; });
    const handle = { name: 'jpdb-popup-reader-yomitan', close: vi.fn() } as unknown as IDBDatabase;
    const open = vi.spyOn(internal, 'openDb').mockReturnValue(pending);
    if (phase === 'pending-handle') internal.dbPromise = {
        then: (...args: Parameters<Promise<IDBDatabase>['then']>) => { reachedHandle(); return pending.then(...args); },
    } as unknown as Promise<IDBDatabase>;
    const acquiring = internal.db();
    const rejected = expect(acquiring).rejects.toThrow('owner changed');
    if (phase === 'opening') await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    else await awaitingHandle;
    installGmStorageFixture();
    resolve(handle);
    await rejected;
    if (phase === 'pending-handle') expect(open).not.toHaveBeenCalled();
});

it.each(['userscript', 'extension'])('%s dictionaries do not share or delete the standalone database', async owner => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const standalone = new YomitanDictionaryStore();
    stores.push(standalone);
    await standalone.importZip(new File([yomitanZipBlob({
        'index.json': { title: 'Standalone dictionary', format: 3 },
        'term_bank_1.json': [['読む', 'よむ', '', '', 1, ['read'], 1, '']],
    })], 'standalone.zip'));
    await standalone.invalidateForFactoryReset();
    installGmStorageFixture();
    if (owner === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'installed-test' } });
    const installed = new YomitanDictionaryStore();
    stores.push(installed);
    expect((await installed.summary()).terms).toBe(0);
    expect((await indexedDB.databases()).map(db => db.name).sort()).toEqual([
        'jpdb-popup-reader-yomitan', `jpdb-popup-reader-yomitan-${owner}-v2`,
    ].sort());
    await installed.deleteDatabase();
    expect((await indexedDB.databases()).map(db => db.name)).toEqual(['jpdb-popup-reader-yomitan']);
    vi.unstubAllGlobals();
    vi.stubGlobal('indexedDB', factory);
    expect(await standalone.summary()).toMatchObject({ terms: 1, dictionaries: [{ title: 'Standalone dictionary' }] });
});

it.each(['clear', 'deleteDatabase', 'delayed-import'] as const)('rejects %s through a standalone instance after installed takeover', async operation => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const store = new YomitanDictionaryStore();
    stores.push(store);
    await store.importZip(new File([yomitanZipBlob({
        'index.json': { title: 'Retained', format: 3 },
        'term_bank_1.json': [['読む', 'よむ', '', '', 1, ['read'], 1, '']],
    })], 'retained.zip'));
    if (operation === 'delayed-import') {
        const replacement = new File([yomitanZipBlob({
            'index.json': { title: 'Retained', format: 3 },
            'term_bank_1.json': [['書く', 'かく', '', '', 1, ['write'], 1, '']],
        })], 'replacement.zip');
        await expect(store.importZip(replacement, () => { installGmStorageFixture(); })).rejects.toThrow('owner changed');
    } else {
        installGmStorageFixture();
        await expect(store[operation]()).rejects.toThrow('owner changed');
    }
    vi.unstubAllGlobals();
    vi.stubGlobal('indexedDB', factory);
    await store.invalidateForFactoryReset();
    expect((await store.summary()).terms).toBe(1);
    expect(await store.lookup('読む', 'よむ', 5)).toHaveLength(1);
    expect(await store.lookup('書く', 'かく', 5)).toHaveLength(0);
});
