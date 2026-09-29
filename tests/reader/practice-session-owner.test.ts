import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { PracticeSessions } from '../../src/reader/study/practice-session';
import { createFactoryResetCoordinator } from '../../src/reader/app/factory-reset-coordinator';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { endSettingsResetGuard } from '../../src/reader/settings';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

afterEach(() => { endSettingsResetGuard(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it.each(['userscript', 'extension'])('preserves %s practice through a standalone reset', async owner => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    const values = new Map<string, unknown>();
    installGmStorageFixture(values);
    if (owner === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'installed' } });
    const installed = new PracticeSessions(factory);
    const session = await installed.start({
        purpose: 'writing', title: 'Retained practice',
        material: [{ id: 'water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water' }],
    });
    await session.dispatch({ kind: 'draft', text: 'みず', turn: session.view().turn });
    for (const name of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'chrome']) vi.stubGlobal(name, undefined);
    expect(await new PracticeSessions(factory).list()).toEqual([]);
    await expect(session.dispatch({ kind: 'draft', text: 'wrong owner', turn: session.view().turn }))
        .resolves.toMatchObject({ kind: 'rejected', reason: 'storage' });
    const dictionaries = new YomitanDictionaryStore();
    const reload = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reset = createFactoryResetCoordinator({
        dictionaries, getLanguage: () => 'en', isDestroyed: () => false,
        invalidateRuntimeStores: () => dictionaries.invalidateForFactoryReset(),
        reload, toast: vi.fn(),
    });
    await reset.resetAllData();
    reset.destroy();
    expect(reload).toHaveBeenCalledOnce();
    endSettingsResetGuard();
    installGmStorageFixture(values);
    if (owner === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'installed' } });
    expect((await installed.resume(session.view().id)).view().current?.response.draft).toBe('みず');
});
