import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HOSTED_STUDY_LOCATION } from './helpers/settings-persistence-fixture';
import { yomitanZipBlob } from './zip-fixture';

// Hosted Study constructs its dictionary store (a NewTabRuntime field) before
// an installed userscript's storage bridge may be ready; the runtime then waits
// for that late authority before touching dictionaries. The store must belong
// to whichever owner is current at its first storage use, and to no other.

type Store = import('../../src/reader/dictionaries/yomitan').YomitanDictionaryStore;
type Bridge = typeof import('../../src/reader/userscript/storage-bridge');

const STANDALONE_DB = 'jpdb-popup-reader-yomitan';
const USERSCRIPT_DB = 'jpdb-popup-reader-yomitan-userscript-v2';
const stores: Store[] = [];
let bridge: Bridge | undefined;

beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
});

afterEach(async () => {
    for (const store of stores.splice(0)) await store.invalidateForFactoryReset();
    bridge?.uninstallUserscriptGmStorageBridge();
    bridge = undefined;
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

it('binds a store built before a late storage bridge to the bridge owner at first use', async () => {
    const store = await pageWorldStore();
    await installLateUserscriptBridge();

    await store.importZip(dictionaryZip('Late bridge', '読む', 'read'));

    expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Late bridge' }]);
    expect(await databaseNames()).toEqual([USERSCRIPT_DB]);
});

it('keeps a store used before the bridge on its first owner and fails closed after', async () => {
    const store = await pageWorldStore();
    await store.importZip(dictionaryZip('Standalone', '読む', 'read'));
    await installLateUserscriptBridge();

    await expect(store.importZip(dictionaryZip('Standalone', '書く', 'write'))).rejects.toThrow('owner changed');
    await expect(store.clear()).rejects.toThrow('owner changed');

    expect(await databaseNames()).toEqual([STANDALONE_DB]);
});

async function pageWorldStore(): Promise<Store> {
    const { YomitanDictionaryStore } = await import('../../src/reader/dictionaries/yomitan');
    const store = new YomitanDictionaryStore();
    stores.push(store);
    return store;
}

/** Content world exposes its GM store through the DOM bridge, then the page world resumes without GM. */
async function installLateUserscriptBridge(): Promise<void> {
    const values = new Map<string, unknown>();
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => { values.set(key, value); });
    vi.stubGlobal('GM_deleteValue', (key: string) => { values.delete(key); });
    vi.stubGlobal('GM_listValues', () => [...values.keys()]);
    bridge = await import('../../src/reader/userscript/storage-bridge');
    bridge.installUserscriptGmStorageBridge();
    for (const name of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues']) vi.stubGlobal(name, undefined);
    expect(bridge.getUserscriptGmStorage()).toBeDefined();
}

function dictionaryZip(title: string, expression: string, gloss: string): File {
    return new File([yomitanZipBlob({
        'index.json': { title, format: 3 },
        'term_bank_1.json': [[expression, '', '', '', 1, [gloss], 1, '']],
    })], `${title}.zip`);
}

async function databaseNames(): Promise<string[]> {
    return (await indexedDB.databases()).map(db => db.name ?? '').sort();
}
