// Study startup when settings storage is genuinely unreadable.
//
// Packaged and hosted (yomureader.com) Study share startNewTabRuntime. When the
// settings backend rejects, or the settings/intent pair stays torn after the
// strict read's retries, Study must show the recovery wall (Retry, Import,
// Reload) instead of leaving <main class="jpdb-reader-newtab"> empty, and must
// never show it on a fresh install or on a store a shipped release left.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { uiText } from '../../src/reader/app/i18n';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { startNewTabRuntime } from '../../src/reader/newtab/runtime';
import { loadSettings } from '../../src/reader/settings';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';
import { v193Corpus, v193CorpusText } from './helpers/upgrade-v193-corpus';

const HOSTED_STUDY_URL = 'https://yomureader.com/study/';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_KEY = 'yomu:settings-intent:v2';
const COMMIT = '__yomuSettingsPersistenceCommitV1';
const WALL = '[data-extension-settings-recovery="blocked"]';
const GM_API = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'] as const;

type WebStorage = Record<string, Record<string, string>>;

interface Visible {
    readonly settings: Record<string, unknown>;
}

interface ExtensionFixture {
    readonly studyUrl: string;
    readonly compilerStoragePrefix: string;
    readonly extensionStorageLocal: Record<string, unknown>;
    readonly expected: { readonly study: Visible };
}

interface HostedFixture {
    readonly webStorage: WebStorage;
    readonly expected: Record<string, Visible>;
    readonly afterUserscriptInstall: {
        readonly gm: Record<string, unknown>;
        readonly webStorage: WebStorage;
        readonly expected: Record<string, Visible>;
    };
}

interface BackupFixture {
    readonly file: string;
    readonly expected: Visible & { readonly dictionaries: readonly string[] };
}

const EXTENSION = v193Corpus<ExtensionFixture>('d-extension-study-and-content-script.json');
const BACKUP = v193Corpus<BackupFixture>('f-backup-file-v1.9.3.json');

// ---------------------------------------------------------------------------
// Storage backends and the realms Study starts in
// ---------------------------------------------------------------------------

interface Backend {
    readonly values: Map<string, unknown>;
    readonly writes: string[];
    failing: boolean;
}

function jsonClone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function createBackend(initial: Record<string, unknown> = {}): Backend {
    return { values: new Map(Object.entries(jsonClone(initial))), writes: [], failing: false };
}

/** A GM store whose reads reject while `failing` is set. */
function installGm(backend: Backend, options: { prefix?: string; async?: boolean } = {}): void {
    const prefix = options.prefix ?? '';
    const answer = <T>(value: () => T): T | Promise<T> => {
        if (backend.failing) {
            const error = new Error('private settings backend failure');
            if (options.async) return Promise.reject(error);
            throw error;
        }
        return options.async ? Promise.resolve(value()) : value();
    };
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => answer(() => (
        backend.values.has(`${prefix}${key}`) ? jsonClone(backend.values.get(`${prefix}${key}`)) : fallback
    )));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => answer(() => {
        backend.writes.push(key);
        backend.values.set(`${prefix}${key}`, jsonClone(value));
    }));
    vi.stubGlobal('GM_deleteValue', (key: string) => answer(() => {
        backend.writes.push(key);
        backend.values.delete(`${prefix}${key}`);
    }));
    vi.stubGlobal('GM_listValues', () => answer(() => [...backend.values.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))));
    vi.stubGlobal('GM_addValueChangeListener', () => 1);
    vi.stubGlobal('GM_removeValueChangeListener', () => undefined);
}

function installExtensionApi(backend: Backend): void {
    const area = {
        get: async (key: string | null) => (key === null
            ? Object.fromEntries([...backend.values].map(([name, value]) => [name, jsonClone(value)]))
            : backend.values.has(key) ? { [key]: jsonClone(backend.values.get(key)) } : {}),
        set: async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) backend.values.set(key, jsonClone(value));
        },
        remove: async (key: string) => { backend.values.delete(key); },
        getKeys: async () => [...backend.values.keys()],
    };
    const api = {
        runtime: { id: 'yomu@yomureader.com', sendMessage: async () => ({}) },
        storage: { local: area, onChanged: { addListener: () => undefined, removeListener: () => undefined } },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('chrome', api);
}

/** A new Study document at `href`: the empty <main> the Study page ships with. */
function newStudyPageLoad(href: string, webStorage: WebStorage = {}): HTMLElement {
    uninstallUserscriptGmStorageBridge();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    delete document.documentElement.dataset.yomuHosted;
    for (const name of [...GM_API, 'browser', 'chrome'] as const) vi.stubGlobal(name, undefined);
    const url = new URL(href);
    vi.stubGlobal('location', Object.assign(url, { reload: vi.fn() }));
    vi.stubGlobal('indexedDB', new IDBFactory());
    localStorage.clear();
    sessionStorage.clear();
    for (const [key, value] of Object.entries(webStorage[url.origin] ?? {})) localStorage.setItem(key, value);
    const main = document.createElement('main');
    main.className = 'jpdb-reader-newtab';
    document.body.replaceChildren(main);
    return main;
}

function enterHostedWebsiteOnly(webStorage?: WebStorage): void {
    newStudyPageLoad(HOSTED_STUDY_URL, webStorage);
    document.documentElement.dataset.yomuHosted = '';
}

/** Hosted Study reaching the userscript's GM store through the page bridge. */
function enterHostedWithUserscript(backend: Backend, webStorage?: WebStorage): void {
    newStudyPageLoad(HOSTED_STUDY_URL, webStorage);
    installGm(backend);
    installUserscriptGmStorageBridge();
    for (const name of GM_API) vi.stubGlobal(name, undefined);
    document.documentElement.dataset.yomuHosted = '';
}

function enterPackagedStudy(backend: Backend): void {
    newStudyPageLoad(EXTENSION.studyUrl);
    installExtensionApi(backend);
    installGm(backend, { prefix: EXTENSION.compilerStoragePrefix, async: true });
    vi.stubGlobal('__YOMU_EXTENSION_STORAGE_PREFIX__', EXTENSION.compilerStoragePrefix);
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
}

interface BackendRealm {
    readonly name: string;
    readonly enter: (logical: Record<string, unknown>) => Backend;
}

const BACKEND_REALMS: readonly BackendRealm[] = [
    {
        name: 'hosted yomureader.com Study with the userscript installed',
        enter: logical => {
            const backend = createBackend(logical);
            enterHostedWithUserscript(backend);
            return backend;
        },
    },
    {
        name: 'packaged extension Study',
        enter: logical => {
            const backend = createBackend(Object.fromEntries(Object.entries(logical)
                .map(([key, value]) => [`${EXTENSION.compilerStoragePrefix}${key}`, value])));
            enterPackagedStudy(backend);
            return backend;
        },
    },
];

// jsdom's Blob predates text()/arrayBuffer(); every browser Yomu ships to has
// both, and backup restore reads files (and the dictionaries inside them) that way.
function readBlob(blob: Blob, as: 'text' | 'buffer'): Promise<string | ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string | ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        if (as === 'text') reader.readAsText(blob);
        else reader.readAsArrayBuffer(blob);
    });
}
if (typeof Blob.prototype.text !== 'function') {
    Blob.prototype.text = function text(this: Blob) { return readBlob(this, 'text') as Promise<string>; };
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) { return readBlob(this, 'buffer') as Promise<ArrayBuffer>; };
}

/**
 * A failed case can leave its guard waiting; the guard is per document, so
 * release it over a plain page (no backend, not hosted) before the next case.
 */
async function releaseAbandonedWall(): Promise<void> {
    const wall = document.querySelector<HTMLElement>(WALL);
    if (!wall) return;
    uninstallUserscriptGmStorageBridge();
    vi.unstubAllGlobals();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    wall.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')?.click();
    await vi.waitFor(() => expect(wall.isConnected).toBe(false));
}

afterEach(async () => {
    await releaseAbandonedWall();
    uninstallUserscriptGmStorageBridge();
    document.body.replaceChildren();
    delete document.documentElement.dataset.yomuHosted;
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Study startup and the wall
// ---------------------------------------------------------------------------

function startStudy() {
    const loaded: ReaderSettings[] = [];
    const createRuntime = vi.fn(() => ({
        // The real runtime's first settings access: a strict loadSettings().
        init: async () => { loaded.push(await loadSettings()); },
        destroy: vi.fn(),
    }));
    const starting = startNewTabRuntime({ createRuntime, registerPagehide: vi.fn() });
    return { loaded, createRuntime, starting };
}

async function recoveryWall(): Promise<HTMLElement> {
    await vi.waitFor(() => expect(document.querySelector(WALL)).not.toBeNull());
    return document.querySelector<HTMLElement>(WALL)!;
}

function wallAction(wall: HTMLElement, action: string): HTMLButtonElement {
    const button = wall.querySelector<HTMLButtonElement>(`[data-recovery-action="${action}"]`);
    expect(button, `${action} action`).not.toBeNull();
    return button!;
}

function importInput(wall: HTMLElement): HTMLInputElement {
    const input = wall.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input, 'hidden settings file input').not.toBeNull();
    return input!;
}

function chooseFile(input: HTMLInputElement, file: File): void {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function v193BackupFile(): File {
    return new File([v193CorpusText(BACKUP.file)], BACKUP.file.split('/').pop()!, { type: 'application/json' });
}

async function wallStatus(wall: HTMLElement, text: string): Promise<void> {
    await vi.waitFor(() => expect(wall.querySelector('[data-recovery-status]')?.textContent).toBe(text));
}

function visible(settings: ReaderSettings, expected: Visible): Record<string, unknown> {
    const record = settings as unknown as Record<string, unknown>;
    return Object.fromEntries(Object.keys(expected.settings).map(key => [key, record[key]]));
}

/** A pair whose commit ids never match: every strict read and retry rejects it. */
const TORN_PAIR = {
    [SETTINGS_KEY]: { learningTargetChosen: true, onboardingSeen: true, theme: 'light', [COMMIT]: 'settings-half' },
    [INTENT_KEY]: { revision: 1, records: {}, [COMMIT]: 'intent-half' },
};

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('hosted Study with an unreadable settings backend', () => {
    it('shows the recovery wall over the Study page instead of an empty <main>, with Retry and Import', async () => {
        const backend = createBackend();
        backend.failing = true;
        enterHostedWithUserscript(backend);
        const main = document.querySelector<HTMLElement>('main.jpdb-reader-newtab')!;
        const { createRuntime, starting } = startStudy();
        let settled = false;
        void starting.then(() => { settled = true; }, () => { settled = true; });

        const wall = await recoveryWall();
        expect(wall.getAttribute('role')).toBe('alert');
        expect(wall.textContent).toContain(uiText('en', 'extensionSettingsRecoveryTitle'));
        expect(wall.textContent).not.toContain('private settings backend failure');
        expect(wallAction(wall, 'retry').textContent).toBe(uiText('en', 'extensionSettingsRecoveryRetry'));
        expect(wallAction(wall, 'import').textContent).toBe(uiText('en', 'importSettings'));
        expect(wallAction(wall, 'reload').textContent).toBe(uiText('en', 'extensionSettingsRecoveryReload'));
        const input = importInput(wall);
        expect(input.accept).toBe('application/json,.json');
        expect(input.hidden).toBe(true);
        expect(main.isConnected).toBe(true);
        expect(main.inert).toBe(true);
        expect(settled).toBe(false);
        expect(createRuntime).not.toHaveBeenCalled();

        const openPicker = vi.spyOn(input, 'click').mockImplementation(() => undefined);
        wallAction(wall, 'import').click();
        expect(openPicker).toHaveBeenCalledOnce();
        chooseFile(input, v193BackupFile());
        await wallStatus(wall, uiText('en', 'actionFailed'));
        expect(wallAction(wall, 'import').disabled).toBe(false);
        expect(createRuntime).not.toHaveBeenCalled();

        wallAction(wall, 'retry').click();
        await wallStatus(wall, uiText('en', 'extensionSettingsRecoveryStillBlocked'));
        expect(createRuntime).not.toHaveBeenCalled();
        expect(backend.writes).toEqual([]);

        backend.failing = false;
        wallAction(wall, 'retry').click();
        await starting;
        expect(document.querySelector(WALL)).toBeNull();
        expect(main.inert).toBe(false);
        expect(createRuntime).toHaveBeenCalledOnce();
    });

    it('speaks Japanese in a Japanese browser, including the Import action and a rejected file', async () => {
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
        const backend = createBackend(TORN_PAIR);
        enterHostedWithUserscript(backend);
        const { createRuntime, starting } = startStudy();

        const wall = await recoveryWall();
        expect(wall.textContent).toContain(uiText('ja', 'extensionSettingsRecoveryTitle'));
        expect(wallAction(wall, 'retry').textContent).toBe(uiText('ja', 'extensionSettingsRecoveryRetry'));
        expect(wallAction(wall, 'import').textContent).toBe(uiText('ja', 'importSettings'));
        expect(wallAction(wall, 'import').textContent).not.toBe(uiText('en', 'importSettings'));
        expect(wallAction(wall, 'reload').textContent).toBe(uiText('ja', 'extensionSettingsRecoveryReload'));

        chooseFile(importInput(wall), new File(['{"not":"a Yomu backup"}'], 'notes.json', { type: 'application/json' }));
        await wallStatus(wall, uiText('ja', 'settingsImportUnsupportedFormat'));
        expect(wall.textContent).not.toContain('未翻訳');
        expect(wall.textContent).not.toMatch(/[A-Za-z]{4,} [A-Za-z]{4,}/);
        expect(wallAction(wall, 'retry').disabled).toBe(false);
        expect(wallAction(wall, 'import').disabled).toBe(false);
        expect(createRuntime).not.toHaveBeenCalled();
        expect(backend.writes).toEqual([]);

        chooseFile(importInput(wall), v193BackupFile());
        await starting;
        expect(createRuntime).toHaveBeenCalledOnce();
    });
});

describe.each(BACKEND_REALMS)('$name with a torn settings pair', realm => {
    it('stays blocked on Retry and recovers by importing the settings file v1.9.3 exported', async () => {
        const backend = realm.enter(TORN_PAIR);
        const { loaded, createRuntime, starting } = startStudy();

        const wall = await recoveryWall();
        wallAction(wall, 'retry').click();
        await wallStatus(wall, uiText('en', 'extensionSettingsRecoveryStillBlocked'));
        expect(createRuntime).not.toHaveBeenCalled();
        expect(backend.writes).toEqual([]);

        chooseFile(importInput(wall), v193BackupFile());
        await starting;

        expect(document.querySelector(WALL)).toBeNull();
        expect(createRuntime).toHaveBeenCalledOnce();
        expect(visible(loaded[0], BACKUP.expected)).toEqual(BACKUP.expected.settings);
        resetManagedStateEpochSessionsForTests();
        expect(visible(await loadSettings(), BACKUP.expected)).toEqual(BACKUP.expected.settings);
        const dictionaries = await new YomitanDictionaryStore().summary();
        expect(dictionaries.dictionaries.map(entry => entry.title)).toEqual(BACKUP.expected.dictionaries);
    });
});

describe('Study on a fresh install', () => {
    const FRESH_REALMS: ReadonlyArray<[string, () => Backend | null]> = [
        ['hosted yomureader.com Study, website only', () => { enterHostedWebsiteOnly(); return null; }],
        ...BACKEND_REALMS.map(realm => [realm.name, () => realm.enter({})] as [string, () => Backend]),
    ];

    it.each(FRESH_REALMS)('%s starts without the recovery wall or a settings write', async (_name, enter) => {
        const backend = enter();
        const prepend = vi.spyOn(document.body, 'prepend');
        const { loaded, createRuntime, starting } = startStudy();

        await starting;

        expect(prepend).not.toHaveBeenCalled();
        expect(document.querySelector(WALL)).toBeNull();
        expect(createRuntime).toHaveBeenCalledOnce();
        expect(loaded[0].learningTargetChosen).toBe(false);
        expect(backend?.writes.filter(key => key === SETTINGS_KEY || key === INTENT_KEY) ?? []).toEqual([]);
        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    });
});

describe('Study over the stores v1.9.3 left', () => {
    const HOSTED = [
        'e1-hosted-homepage-demo',
        'e2-hosted-academy-seed',
        'e3-hosted-appearance-toggles',
        'e4-hosted-study-website-only',
    ].map(name => [name, v193Corpus<HostedFixture>(`${name}.json`)] as const);
    const USERSCRIPT = [
        'a-userscript-explicit-save',
        'a2-userscript-after-factory-reset',
        'b0-userscript-untouched-pre-ledger',
        'b-userscript-machine-only-unmarked',
        'c1-userscript-folded-pins-explicit',
        'c2-userscript-folded-pins-machine',
    ].map(name => [name, v193Corpus<{ gm: Record<string, unknown>; webStorage: WebStorage; expected: Visible }>(`${name}.json`)] as const);

    async function expectStudyStartsWith(expected: Visible): Promise<void> {
        const prepend = vi.spyOn(document.body, 'prepend');
        const { loaded, createRuntime, starting } = startStudy();
        await starting;
        expect(prepend).not.toHaveBeenCalled();
        expect(createRuntime).toHaveBeenCalledOnce();
        expect(visible(loaded[0], expected)).toEqual(expected.settings);
    }

    it.each(HOSTED)('%s: website-only hosted Study never sees the wall', async (_name, fixture) => {
        enterHostedWebsiteOnly(fixture.webStorage);
        await expectStudyStartsWith(fixture.expected[HOSTED_STUDY_URL]);
    });

    it.each(HOSTED)('%s: hosted Study with the userscript installed never sees the wall', async (_name, fixture) => {
        const after = fixture.afterUserscriptInstall;
        enterHostedWithUserscript(createBackend(after.gm), after.webStorage);
        await expectStudyStartsWith(after.expected[HOSTED_STUDY_URL]);
    });

    it.each(USERSCRIPT)('%s: hosted Study through the userscript bridge never sees the wall', async (_name, fixture) => {
        enterHostedWithUserscript(createBackend(fixture.gm), fixture.webStorage);
        await expectStudyStartsWith(fixture.expected);
    });

    it('d-extension-study-and-content-script: packaged Study never sees the wall', async () => {
        enterPackagedStudy(createBackend(EXTENSION.extensionStorageLocal));
        await expectStudyStartsWith(EXTENSION.expected.study);
    });
});
