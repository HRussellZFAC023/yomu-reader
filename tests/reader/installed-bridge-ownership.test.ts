import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error The packaging hardener is a Node ESM script exercised directly by the build.
import { EXTENSION_INSTALLED_RUNTIME_PRELUDE } from '../../scripts/lib/extension-runtime-hardening.mjs';
import { INSTALLED_READER_RUNTIME_MARKER_ID } from '../../src/reader/app/runtime-presence';
import { USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS } from '../../src/reader/userscript/bridge-runtime';

// A hosted Yomu page (Study, Academy, PDF and video readers) runs in the page
// world and reaches the installed Reader through DOM bridges. The extension's
// userscript body starts only after its storage hydrates, so it arrives after a
// userscript manager and often after page scripts. These cases run each realm
// as its own module instance in one document, in the orders browsers produce.

type StorageBridge = typeof import('../../src/reader/userscript/storage-bridge');
type HttpBridge = typeof import('../../src/reader/userscript/bridge-runtime');
type Storage = typeof import('../../src/reader/app/storage');
type Kind = 'userscript' | 'extension';

const STUDY_URL = 'https://yomureader.com/study/';
const UI_KEY = 'jpdb-reader-newtab-ui';
const KANJI_URL = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/081ea.svg';
const realms: Array<{ storage: StorageBridge; http: HttpBridge }> = [];

beforeEach(() => {
    vi.stubGlobal('location', new URL(STUDY_URL));
});

afterEach(() => {
    vi.useRealTimers();
    for (const realm of realms.splice(0)) {
        realm.storage.uninstallUserscriptGmStorageBridge();
        realm.http.uninstallUserscriptHttpBridge();
    }
    document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.remove();
    for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key];
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
});

function gmStore(initial: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initial));
    const requests: string[] = [];
    return { values, requests };
}

/**
 * An installed Reader's isolated world: its own GM store, announcement and
 * responders. Like entry.ts, it installs its HTTP responder only once a
 * Learning Target is chosen.
 */
async function startInstalledRealm(
    kind: Kind,
    store: ReturnType<typeof gmStore>,
    { targetChosen = true }: { targetChosen?: boolean } = {},
): Promise<void> {
    vi.resetModules();
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (store.values.has(key) ? store.values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => { store.values.set(key, value); });
    vi.stubGlobal('GM_deleteValue', (key: string) => { store.values.delete(key); });
    vi.stubGlobal('GM_listValues', () => [...store.values.keys()]);
    vi.stubGlobal('GM_xmlhttpRequest', (details: { url: string; onload?: (response: unknown) => void }) => {
        store.requests.push(details.url);
        details.onload?.({ status: 200, responseText: kind, response: kind, finalUrl: details.url });
    });
    if (kind === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'yomu-test-extension' } });
    const { announceInstalledReaderRuntime } = await import('../../src/reader/app/runtime-presence');
    announceInstalledReaderRuntime();
    const storage = await import('../../src/reader/userscript/storage-bridge');
    const http = await import('../../src/reader/userscript/bridge-runtime');
    storage.installUserscriptGmStorageBridge();
    if (targetChosen) http.installUserscriptHttpBridge();
    realms.push({ storage, http });
    for (const name of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues', 'GM_xmlhttpRequest', 'chrome']) {
        vi.stubGlobal(name, undefined);
    }
}

/** The packaged extension's synchronous document_start announcement. */
function runExtensionPrelude(): void {
    new Function(EXTENSION_INSTALLED_RUNTIME_PRELUDE as string)();
}

async function pageWorld(): Promise<{ storage: Storage; http: HttpBridge }> {
    vi.resetModules();
    const storage = await import('../../src/reader/app/storage');
    const http = await import('../../src/reader/userscript/bridge-runtime');
    return { storage, http };
}

function stubPageFetch() {
    const fetchMock = vi.fn(async () => new Response('fetched', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

async function pageRequests() {
    vi.resetModules();
    return await import('../../src/reader/network/http-request');
}

describe('hosted page bridge ownership', () => {
    it('announces the extension before any page script, and a later userscript never demotes it', async () => {
        runExtensionPrelude();
        const marker = document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
        expect(marker?.dataset.yomuInstalledRuntimeKind).toBe('extension');
        await startInstalledRealm('userscript', gmStore());
        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset.yomuInstalledRuntimeKind).toBe('extension');
    });

    it('keeps settings and grades in the extension when a userscript answered first', async () => {
        const userscript = gmStore();
        const extension = gmStore();
        await startInstalledRealm('userscript', userscript);
        runExtensionPrelude();
        const page = await pageWorld();

        const ready = page.storage.ensureManagedWebStorageCurrent();
        const saved = page.storage.gmStorageSet(UI_KEY, { tab: 'study' });
        await startInstalledRealm('extension', extension);
        await ready;
        await saved;

        expect(extension.values.get(UI_KEY)).toEqual({ tab: 'study' });
        expect(userscript.values.has(UI_KEY)).toBe(false);
        await expect(page.storage.gmStorageGet(UI_KEY, 'FALLBACK')).resolves.toEqual({ tab: 'study' });
    });

    it('waits for a late extension instead of pinning the website epoch and store', async () => {
        const reset = { version: 1, generation: 1, resetId: 'packaged-study-reset', committedAt: 1_000 };
        const extension = gmStore({ 'yomu:state-epoch': reset });
        runExtensionPrelude();
        const page = await pageWorld();

        const ready = page.storage.ensureManagedWebStorageCurrent();
        await startInstalledRealm('extension', extension);
        await ready;

        await page.storage.gmStorageSet(UI_KEY, { tab: 'search' });
        await expect(page.storage.gmStorageGet(UI_KEY, 'FALLBACK')).resolves.toEqual({ tab: 'search' });
        await expect(page.storage.exportManagedStoredValues()).resolves.toMatchObject({ [UI_KEY]: { tab: 'search' } });
        expect(localStorage.getItem(UI_KEY)).toBeNull();
    });

    it('sends one page request through exactly one installed Reader', async () => {
        const userscript = gmStore();
        const extension = gmStore();
        await startInstalledRealm('userscript', userscript);
        runExtensionPrelude();
        await startInstalledRealm('extension', extension);
        const page = await pageWorld();

        const request = page.http.getUserscriptHttpRequest();
        expect(request).toBeDefined();
        await expect(page.http.probeUserscriptEventBridge(request)).resolves.toBe(true);
        const response = await request!({ method: 'POST', url: 'http://127.0.0.1:8765/', data: '{"action":"answerCards"}' });

        expect(response).toMatchObject({ responseText: 'extension' });
        expect(extension.requests).toEqual(['http://127.0.0.1:8765/']);
        expect(userscript.requests).toEqual([]);
    });

    it('sends a request with a progress callback to a Reader in another world', async () => {
        const extension = gmStore();
        runExtensionPrelude();
        await startInstalledRealm('extension', extension);
        const page = await pageWorld();
        // A browser structured-clones an event detail into another world and
        // hands over null when that fails, so the detail must clone cleanly.
        const details: unknown[] = [];
        const capture = (event: Event) => details.push((event as CustomEvent).detail);
        window.addEventListener('yomu-userscript-http-request', capture);

        const request = page.http.getUserscriptHttpRequest();
        const response = await request!({ method: 'GET', url: KANJI_URL, responseType: 'blob', onprogress: () => undefined });
        window.removeEventListener('yomu-userscript-http-request', capture);

        expect(response).toMatchObject({ responseText: 'extension' });
        expect(extension.requests).toEqual([KANJI_URL]);
        expect(details.length).toBeGreaterThan(0);
        for (const detail of details) expect(() => structuredClone(detail)).not.toThrow();
    });

    it('fetches at once while the installed Reader has no Learning Target and so no request responder', async () => {
        vi.useFakeTimers();
        await startInstalledRealm('userscript', gmStore(), { targetChosen: false });
        const fetchMock = stubPageFetch();
        const page = await pageWorld();
        const { requestHttp } = await pageRequests();

        expect(page.http.getUserscriptHttpRequest()).toBeUndefined();
        const first = requestHttp(KANJI_URL, { responseType: 'text' });
        await vi.advanceTimersByTimeAsync(USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await expect(first).resolves.toBe('fetched');

        const second = requestHttp(KANJI_URL, { responseType: 'text' });
        await vi.advanceTimersByTimeAsync(USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await expect(second).resolves.toBe('fetched');
    });

    it('stops waiting when a late extension starts without a request responder', async () => {
        vi.useFakeTimers();
        runExtensionPrelude();
        const fetchMock = stubPageFetch();
        const { requestHttp } = await pageRequests();

        const result = requestHttp(KANJI_URL, { responseType: 'text' });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchMock).not.toHaveBeenCalled();
        await startInstalledRealm('extension', gmStore(), { targetChosen: false });
        await vi.advanceTimersByTimeAsync(USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS - 1);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        await expect(result).resolves.toBe('fetched');
    });

    it('serves a request made before a late extension with a Learning Target starts', async () => {
        runExtensionPrelude();
        const fetchMock = stubPageFetch();
        const { requestHttp } = await pageRequests();
        const extension = gmStore();

        const result = requestHttp(KANJI_URL, { responseType: 'text' });
        await new Promise(resolve => setTimeout(resolve, 50));
        await startInstalledRealm('extension', extension);

        await expect(result).resolves.toBe('extension');
        expect(extension.requests).toEqual([KANJI_URL]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses the request responder a Reader installs once its Learning Target is chosen', async () => {
        const store = gmStore();
        await startInstalledRealm('userscript', store, { targetChosen: false });
        const fetchMock = stubPageFetch();
        const page = await pageWorld();
        expect(page.http.getUserscriptHttpRequest()).toBeUndefined();

        vi.stubGlobal('GM_xmlhttpRequest', (details: { url: string; onload?: (response: unknown) => void }) => {
            store.requests.push(details.url);
            details.onload?.({ status: 200, responseText: 'userscript', response: 'userscript', finalUrl: details.url });
        });
        realms[0]!.http.installUserscriptHttpBridge();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);

        const request = page.http.getUserscriptHttpRequest();
        await expect(page.http.probeUserscriptEventBridge(request)).resolves.toBe(true);
        await expect(request!({ method: 'GET', url: 'https://jpdb.io/review' })).resolves.toMatchObject({ responseText: 'userscript' });
        expect(store.requests).toEqual(['https://jpdb.io/review']);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serves one request when only userscript managers answer, whichever installed first', async () => {
        const first = gmStore();
        const second = gmStore();
        await startInstalledRealm('userscript', first);
        await startInstalledRealm('userscript', second);
        const page = await pageWorld();

        await page.http.getUserscriptHttpRequest()!({ method: 'GET', url: 'https://jpdb.io/review' });
        await page.storage.gmStorageSet(UI_KEY, { tab: 'study' });

        expect([...first.requests, ...second.requests]).toEqual(['https://jpdb.io/review']);
        expect(first.values.get(UI_KEY)).toEqual({ tab: 'study' });
        expect(second.values.has(UI_KEY)).toBe(false);
    });
});
