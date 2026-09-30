import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HOSTED_STUDY_LOCATION } from './helpers/settings-persistence-fixture';
import { yomitanZipBlob } from './zip-fixture';

// Hosted Study constructs its dictionary store (a NewTabRuntime field) before
// an installed userscript's storage bridge may be ready. An origin has one
// dictionary database whichever runtime reaches it, as in v1.9.3; the reset
// epoch, not a per-owner database name, decides whether a realm may use it.

type Store = import('../../src/reader/dictionaries/yomitan').YomitanDictionaryStore;
type Bridge = typeof import('../../src/reader/userscript/storage-bridge');

const DICTIONARY_DB = 'jpdb-popup-reader-yomitan';
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
    document.getElementById('jpdb-reader-installed-runtime')?.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

it('serves a store built before an announced userscript bridge from the origin database', async () => {
    const { markInstalledReaderRuntime } = await import('../../src/reader/app/runtime-presence');
    markInstalledReaderRuntime('userscript');
    const store = await pageWorldStore();
    const imported = store.importZip(dictionaryZip('Late bridge', '読む', 'read'));
    await installLateUserscriptBridge();
    await imported;

    expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Late bridge' }]);
    expect(await databaseNames()).toEqual([DICTIONARY_DB]);
});

it('keeps using the origin database when a bridge appears after first use', async () => {
    const store = await pageWorldStore();
    await store.importZip(dictionaryZip('Before', '読む', 'read'));
    await installLateUserscriptBridge();

    await store.importZip(dictionaryZip('After', '書く', 'write'));

    expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Before' }]);
    expect(await store.lookup('書く', 'かく', 5)).toMatchObject([{ dictionary: 'After' }]);
    expect(await databaseNames()).toEqual([DICTIONARY_DB]);
});

it('fails closed when a late bridge belongs to a newer reset', async () => {
    const store = await pageWorldStore();
    await store.importZip(dictionaryZip('Before', '読む', 'read'));
    await installLateUserscriptBridge({ 'yomu:state-epoch': { version: 1, generation: 1, resetId: 'reset', committedAt: 1 } });

    await expect(store.clear()).rejects.toThrow('current epoch is 1:reset');
    expect(await databaseNames()).toEqual([DICTIONARY_DB]);
});

async function pageWorldStore(): Promise<Store> {
    const { YomitanDictionaryStore } = await import('../../src/reader/dictionaries/yomitan');
    const store = new YomitanDictionaryStore();
    stores.push(store);
    return store;
}

/** Content world exposes its GM store through the DOM bridge, then the page world resumes without GM. */
async function installLateUserscriptBridge(initial: Record<string, unknown> = {}): Promise<void> {
    const values = new Map<string, unknown>(Object.entries(initial));
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
