import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { afterEach, expect, it, vi } from 'vitest';
import { gmStorageGet, gmStorageSet, gmStorageDelete, gmStorageGetSync, gmStorageSetSync, gmStorageDeleteSync, clearManagedBrowserCaches, unregisterManagedServiceWorkers } from '../../src/reader/app/storage';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

const key = 'yomu:srs-local:v2:card:local-word';
const standalone = JSON.stringify({ expression: '読む', reading: 'よむ', reviews: 7 });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it('does not delete standalone data when an installed getter has no mutation API', () => {
    localStorage.setItem(key, standalone);
    vi.stubGlobal('GM_getValue', (_name: string, fallback: unknown) => fallback);
    vi.stubGlobal('GM_setValue', undefined);
    vi.stubGlobal('GM_deleteValue', undefined);
    gmStorageDeleteSync(key);
    expect(localStorage.getItem(key)).toBe(standalone);
});

it.each([false, true])('keeps synchronous entry points isolated with async deletion=%s', async asyncDeletion => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    localStorage.setItem(key, standalone);
    const values = new Map<string, unknown>();
    vi.stubGlobal('GM_getValue', (name: string, fallback: unknown) => values.has(name) ? values.get(name) : fallback);
    vi.stubGlobal('GM_setValue', (name: string, value: unknown) => { values.set(name, value); });
    vi.stubGlobal('GM_deleteValue', (name: string) => { values.delete(name); return asyncDeletion ? Promise.resolve() : undefined; });
    expect(gmStorageGetSync(key, null)).toBeNull();
    expect(values.has(key)).toBe(false);
    gmStorageSetSync(key, { expression: '書く' });
    expect(values.get(key)).toEqual({ expression: '書く' });
    expect(localStorage.getItem(key)).toBe(standalone);
    gmStorageDeleteSync(key);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(values.has(key)).toBe(false);
    expect(localStorage.getItem(key)).toBe(standalone);
});

it('clears only Yomu page caches and service workers when an installed runtime resets', async () => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    installGmStorageFixture();
    const deleteCache = vi.fn(async () => true);
    const unregister = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: vi.fn(async () => ['yomu-newtab-old', 'foreign-cache']), delete: deleteCache });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: vi.fn(async () => [
        { scope: 'https://yomureader.com/study/', unregister },
    ]) } });
    await expect(clearManagedBrowserCaches()).resolves.toBe(1);
    await expect(unregisterManagedServiceWorkers()).resolves.toBe(1);
    expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-old');
    expect(deleteCache).not.toHaveBeenCalledWith('foreign-cache');
});

it('adopts a website-only learner record into a fresh installed store without recorded learner choices', async () => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    localStorage.setItem(key, standalone);
    const { values } = installGmStorageFixture();
    await expect(gmStorageGet(key, null)).resolves.toEqual(JSON.parse(standalone));
    expect(values.get(key)).toEqual(JSON.parse(standalone));
    expect(localStorage.getItem(key)).toBe(standalone);
});

it.each(['established', 'failed'] as const)('does not adopt website-only learner records into a %s installed store', async mode => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    localStorage.setItem(key, standalone);
    const installed = mode === 'established' ? serializeSettingsPersistencePair(
        { ...DEFAULT_SETTINGS, theme: 'dark' },
        { revision: 1, records: { theme: { seq: 1, value: 'dark' } } },
    ) : {};
    const { getValue, setValue } = installGmStorageFixture(new Map(Object.entries(installed)));
    if (mode === 'failed') getValue.mockImplementation(async (requested, fallback) => {
        if (requested === key) throw new Error('unavailable');
        return fallback;
    });
    await expect(gmStorageGet(key, null)).resolves.toBeNull();
    expect(setValue).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(standalone);
});

it.each(['success', 'failure', 'delete'] as const)('does not overwrite standalone learner records during installed %s', async mode => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    localStorage.setItem(key, standalone);
    const fixture = installGmStorageFixture(new Map([[key, { version: 1, cards: {} }]]));
    if (mode === 'failure') fixture.setValue.mockRejectedValue(new Error('unavailable'));
    if (mode === 'delete') await gmStorageDelete(key);
    else if (mode === 'failure') await expect(gmStorageSet(key, { version: 1, cards: {} })).rejects.toThrow();
    else await gmStorageSet(key, { version: 1, cards: {} });
    expect(localStorage.getItem(key)).toBe(standalone);
});
