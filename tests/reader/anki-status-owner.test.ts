import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { openAnkiStatusIndexDb, putAnkiStatusIndexMeta, clearAnkiStatusIndexStores, loadAnkiStatusIndexFromIndexedDb } from '../../src/reader/anki/status-index';
import { clearManagedStoredValues } from '../../src/reader/app/storage';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

const handles: IDBDatabase[] = [];
afterEach(() => { handles.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it.each(['userscript', 'extension'])('isolates %s Anki cache and reset from standalone status', async owner => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const standalone = await openAnkiStatusIndexDb();
    handles.push(standalone);
    await putAnkiStatusIndexMeta(standalone, {
        id: 'current', version: 1, settingsKey: 'standalone-settings', syncedAt: 1, checkedAt: 1,
        cardCount: 1, entryCount: 0, entryStore: 'indexeddb', entries: {},
    });
    const { values } = installGmStorageFixture();
    vi.stubGlobal('GM_listValues', async () => [...values.keys()]);
    if (owner === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'installed' } });
    const installed = await openAnkiStatusIndexDb();
    handles.push(installed);
    expect(installed.name).toBe(`yomu-anki-status-index-${owner}-v2`);
    await expect(loadAnkiStatusIndexFromIndexedDb()).resolves.toBeNull();
    await expect(clearAnkiStatusIndexStores(standalone)).rejects.toThrow('owner changed');
    installed.close();
    await clearManagedStoredValues();
    vi.unstubAllGlobals();
    vi.stubGlobal('indexedDB', factory);
    await expect(loadAnkiStatusIndexFromIndexedDb()).resolves.toMatchObject({ settingsKey: 'standalone-settings' });
});
