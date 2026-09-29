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

it('keeps website caches and service workers when installed runtime invalidation calls cleanup directly', async () => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    installGmStorageFixture();
    const listCaches = vi.fn(async () => ['yomu-newtab-old']);
    const listWorkers = vi.fn(async () => []);
    vi.stubGlobal('caches', { keys: listCaches, delete: vi.fn(async () => true) });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: listWorkers } });
    await expect(clearManagedBrowserCaches()).resolves.toBe(0);
    await expect(unregisterManagedServiceWorkers()).resolves.toBe(0);
    expect(listCaches).not.toHaveBeenCalled();
    expect(listWorkers).not.toHaveBeenCalled();
});

it.each(['missing', 'failed'] as const)('does not adopt standalone learner records on a %s installed read', async mode => {
    vi.stubGlobal('location', HOSTED_STUDY_LOCATION);
    localStorage.setItem(key, standalone);
    const { getValue, setValue } = installGmStorageFixture();
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
