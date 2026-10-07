// Upgrade corpus: v2 against the bytes shipped releases actually persisted.
//
// Every fixture in ./fixtures/upgrade-v1.9.3/ was produced by running the
// v1.8.80, v1.8.90 and v1.9.3 source itself (scripts/upgrade-corpus/capture.mjs)
// and records what that release showed the learner afterwards. Each case seeds
// those bytes into the channel they came from and asserts that v2 shows the
// learner the same thing: their settings, no first-run setup, a working Save,
// importable backups and visible dictionaries. Nothing here is hand-shaped.
//
// scripts/upgrade-corpus/self-check.mjs runs this same file against the v1.9.3
// source, where every case passes: a failure here is a v2 behaviour change,
// not a harness artefact. Regenerate the corpus with capture.mjs, never by hand.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { loadSettings, normalizeReaderSettings, saveSettings } from '../../src/reader/settings';
import { loadReaderStartupSettings } from '../../src/reader/app/startup';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { ensureExtensionStudySettingsAuthority } from '../../src/reader/newtab/extension-settings-recovery-guard';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';
import { parseReaderSettingsBackup } from '../../src/reader/settings/file-io';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { validateCloudSettingsEnvelope } from '../../src/reader/settings/cloud-settings-envelope';
import {
    runSettingsRestoreTransaction,
    settingsRestoreSaveOptions,
    witnessedSettingsRestoreCandidate,
} from '../../src/reader/settings/settings-restore-transaction';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

type WebStorage = Record<string, Record<string, string>>;

interface Visible {
    readonly settings: Record<string, unknown>;
    readonly targetLanguage: string | null;
    readonly onboardingShown: boolean;
    readonly dictionaries?: readonly string[];
}

interface UserscriptFixture {
    readonly scenario: string;
    readonly story: string;
    readonly location: string;
    readonly gm: Record<string, unknown>;
    readonly webStorage: WebStorage;
    readonly expected: Visible;
}

interface ExtensionFixture {
    readonly compilerStoragePrefix: string;
    readonly studyUrl: string;
    readonly contentScriptUrl: string;
    readonly extensionStorageLocal: Record<string, unknown>;
    readonly webStorage: WebStorage;
    readonly expected: { readonly study: Visible; readonly contentScript: Visible };
}

interface HostedFixture {
    readonly scenario: string;
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
    readonly storageKeys: readonly string[];
    readonly expected: Visible;
}

interface DumpedStore {
    readonly name: string;
    readonly keyPath: string | string[] | null;
    readonly autoIncrement: boolean;
    readonly indexes: ReadonlyArray<{ name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }>;
    readonly records: ReadonlyArray<{ key: IDBValidKey; value: unknown }>;
}

interface IndexedDbChannel {
    readonly location: string;
    readonly databasesOpened: readonly string[];
    readonly dictionaries: string;
    readonly lookupGlossary: readonly unknown[];
    readonly dictionaryDatabase: { name: string; version: number; stores: DumpedStore[] };
}

interface IndexedDbFixture {
    readonly dictionaryTitle: string;
    readonly channels: Record<string, IndexedDbChannel>;
}

const CORPUS = path.resolve(import.meta.dirname, 'fixtures', 'upgrade-v1.9.3');

function corpusText(relative: string): string {
    return readFileSync(path.join(CORPUS, relative), 'utf8');
}

function corpus<T>(relative: string): T {
    return JSON.parse(corpusText(relative)) as T;
}

const HOSTED_STUDY_URL = 'https://yomureader.com/study/';
const EXTENSION_ID = 'yomu@yomureader.com';
// The settings fields every fixture recorded from v1.9.3's own reload.
// Retain the captured historical bytes; compare only options still shown by 2.1.
const VISIBLE_KEYS = Object.keys(corpus<UserscriptFixture>('a-userscript-explicit-save.json').expected.settings)
    .filter(key => key !== 'learningTargetChosen' && key !== 'onboardingSeen');

// ---------------------------------------------------------------------------
// Realms: the same channels the corpus was captured in, now running v2.
// ---------------------------------------------------------------------------

interface Store {
    readonly values: Map<string, unknown>;
}

function jsonClone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function createStore(initial: Record<string, unknown> = {}): Store {
    return { values: new Map(Object.entries(jsonClone(initial))) };
}

const GM_API = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'] as const;

/** Tampermonkey semantics: synchronous GM_* over a JSON-cloned store. */
function installGm(store: Store, options: { prefix?: string; async?: boolean } = {}): void {
    const prefix = options.prefix ?? '';
    const answer = <T>(value: T): T | Promise<T> => (options.async ? Promise.resolve(value) : value);
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => answer(
        store.values.has(`${prefix}${key}`) ? jsonClone(store.values.get(`${prefix}${key}`)) : fallback,
    ));
    vi.stubGlobal('GM_setValue', (key: string, value: unknown) => answer(void store.values.set(`${prefix}${key}`, jsonClone(value))));
    vi.stubGlobal('GM_deleteValue', (key: string) => answer(void store.values.delete(`${prefix}${key}`)));
    vi.stubGlobal('GM_listValues', () => answer([...store.values.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))));
    vi.stubGlobal('GM_addValueChangeListener', () => 1);
    vi.stubGlobal('GM_removeValueChangeListener', () => undefined);
}

function installExtensionApi(store: Store): void {
    const area = {
        get: async (key: string | null) => (key === null
            ? Object.fromEntries([...store.values].map(([name, value]) => [name, jsonClone(value)]))
            : store.values.has(key) ? { [key]: jsonClone(store.values.get(key)) } : {}),
        set: async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) store.values.set(key, jsonClone(value));
        },
        remove: async (key: string) => { store.values.delete(key); },
        getKeys: async () => [...store.values.keys()],
    };
    const api = {
        runtime: { id: EXTENSION_ID, sendMessage: async () => ({}) },
        storage: { local: area, onChanged: { addListener: () => undefined, removeListener: () => undefined } },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('chrome', api);
}

/** A new page load at `href`, with that origin's recorded Web Storage. */
function newPageLoad(href: string, webStorage: WebStorage = {}): void {
    uninstallUserscriptGmStorageBridge();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    document.body.replaceChildren();
    delete document.documentElement.dataset.yomuHosted;
    for (const name of [...GM_API, 'browser', 'chrome'] as const) vi.stubGlobal(name, undefined);
    const url = new URL(href);
    vi.stubGlobal('location', url);
    localStorage.clear();
    sessionStorage.clear();
    for (const [key, value] of Object.entries(webStorage[url.origin] ?? {})) localStorage.setItem(key, value);
}

function enterUserscriptSite(gm: Store, href: string, webStorage?: WebStorage): void {
    newPageLoad(href, webStorage);
    installGm(gm);
}

function enterHostedStudyWithUserscript(gm: Store, webStorage?: WebStorage): void {
    newPageLoad(HOSTED_STUDY_URL, webStorage);
    installGm(gm);
    installUserscriptGmStorageBridge();
    for (const name of GM_API) vi.stubGlobal(name, undefined);
    document.documentElement.dataset.yomuHosted = '';
}

function enterHostedWithoutInstall(href: string, webStorage?: WebStorage): void {
    newPageLoad(href, webStorage);
    document.documentElement.dataset.yomuHosted = '';
}

function enterPackagedStudy(storage: Store, fixture: Pick<ExtensionFixture, 'studyUrl' | 'compilerStoragePrefix'>): void {
    newPageLoad(fixture.studyUrl);
    installExtensionApi(storage);
    installGm(storage, { prefix: fixture.compilerStoragePrefix, async: true });
    vi.stubGlobal('__YOMU_EXTENSION_STORAGE_PREFIX__', fixture.compilerStoragePrefix);
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
}

function enterContentScript(storage: Store, href: string, prefix: string): void {
    newPageLoad(href);
    installExtensionApi(storage);
    installGm(storage, { prefix });
}

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

afterEach(() => {
    uninstallUserscriptGmStorageBridge();
    document.body.replaceChildren();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// What the learner sees
// ---------------------------------------------------------------------------

function visibleSettings(settings: ReaderSettings | Record<string, unknown>): Record<string, unknown> {
    const record = settings as unknown as Record<string, unknown>;
    return Object.fromEntries(VISIBLE_KEYS.map(key => [key, record[key]]));
}

function targetLanguage(settings: ReaderSettings): string | null {
    const profiles = (settings as { languageProfiles?: Array<{ id?: string; targetLanguage?: string }> }).languageProfiles ?? [];
    return profiles.find(profile => profile.id === settings.activeLanguageProfileId)?.targetLanguage ?? null;
}

/** Loads settings the way v2 boots and compares with what v1.9.3 showed. */
async function expectSameAsV193(expected: Visible): Promise<ReaderSettings> {
    const settings = await loadSettings();
    expect(visibleSettings(settings)).toEqual(visibleSettings(expected.settings));
    expect(targetLanguage(settings)).toBe(expected.targetLanguage);
    // Setup was removed in 2.1; retained startup tests exercise fresh and upgraded rendering.
    expect(settings).not.toHaveProperty('onboardingSeen');
    return settings;
}

function expectNothingErased(before: Record<string, unknown>, store: Store): void {
    const missing = Object.keys(before).filter(key => !store.values.has(key));
    expect(missing, 'stored learner keys removed by the upgrade').toEqual([]);
}

/** A learner's next Save after the update must land and keep their choices. */
async function expectSaveStillWorks(expected: Visible): Promise<void> {
    const current = await loadSettings();
    await saveSettings({ ...current, subtitleFontSize: 44 }, { explicitUserChoiceKeys: ['subtitleFontSize'] });
    resetManagedStateEpochSessionsForTests();
    const reloaded = await loadSettings();
    expect(visibleSettings(reloaded)).toEqual({ ...visibleSettings(expected.settings), subtitleFontSize: 44 });
}

// ---------------------------------------------------------------------------
// (a, a2, b0, b, c1, c2) userscript stores
// ---------------------------------------------------------------------------

const USERSCRIPT_SCENARIOS = [
    'a-userscript-explicit-save',
    'a2-userscript-after-factory-reset',
    'b0-userscript-untouched-pre-ledger',
    'b-userscript-machine-only-unmarked',
    'c1-userscript-folded-pins-explicit',
    'c2-userscript-folded-pins-machine',
].map(name => corpus<UserscriptFixture>(`${name}.json`));

describe.each(USERSCRIPT_SCENARIOS)('userscript store left by v1.9.3: $scenario', fixture => {
    it('starts the Reader on an ordinary site with the learner settings and no first-run setup', async () => {
        const gm = createStore(fixture.gm);
        enterUserscriptSite(gm, fixture.location, fixture.webStorage);
        const startup = await loadReaderStartupSettings();
        expect(startup.settings).not.toHaveProperty('learningTargetChosen');
        await expectSameAsV193(fixture.expected);
        expectNothingErased(fixture.gm, gm);
    });

    it('shows the same settings in hosted Study through the userscript bridge', async () => {
        enterHostedStudyWithUserscript(createStore(fixture.gm), fixture.webStorage);
        await expectSameAsV193(fixture.expected);
    });

    it('accepts the next Settings Save and keeps every earlier choice', async () => {
        enterUserscriptSite(createStore(fixture.gm), fixture.location, fixture.webStorage);
        await expectSaveStillWorks(fixture.expected);
    });
});

// ---------------------------------------------------------------------------
// (d) packaged extension: Study and content script over one prefixed store
// ---------------------------------------------------------------------------

describe('extension store left by v1.9.3: d-extension-study-and-content-script', () => {
    const fixture = corpus<ExtensionFixture>('d-extension-study-and-content-script.json');

    it('opens packaged Study without the settings recovery wall or first-run setup', async () => {
        enterPackagedStudy(createStore(fixture.extensionStorageLocal), fixture);
        const guard = ensureExtensionStudySettingsAuthority().then(() => 'ready' as const);
        const settled = await Promise.race([guard, new Promise(resolve => setTimeout(() => resolve('blocked'), 1500))]);
        expect(document.querySelector('[data-extension-settings-recovery]')).toBeNull();
        expect(settled).toBe('ready');
        await expectSameAsV193(fixture.expected.study);
    });

    it('starts the Reader from the content script with the same settings', async () => {
        const storage = createStore(fixture.extensionStorageLocal);
        enterContentScript(storage, fixture.contentScriptUrl, fixture.compilerStoragePrefix);
        await loadReaderStartupSettings();
        await expectSameAsV193(fixture.expected.contentScript);
        expectNothingErased(fixture.extensionStorageLocal, storage);
    });

    it('accepts the next Settings Save from the content script', async () => {
        enterContentScript(createStore(fixture.extensionStorageLocal), fixture.contentScriptUrl, fixture.compilerStoragePrefix);
        await expectSaveStillWorks(fixture.expected.contentScript);
    });
});

// ---------------------------------------------------------------------------
// (e1-e4) yomureader.com visitors, with and without a later userscript
// ---------------------------------------------------------------------------

const HOSTED_SCENARIOS = [
    'e1-hosted-homepage-demo',
    'e2-hosted-academy-seed',
    'e3-hosted-appearance-toggles',
    'e4-hosted-study-website-only',
].map(name => corpus<HostedFixture>(`${name}.json`));

const SITE_AFTER_INSTALL = (fixture: HostedFixture): string => Object.keys(fixture.afterUserscriptInstall.expected)
    .find(href => href !== HOSTED_STUDY_URL)!;

describe.each(HOSTED_SCENARIOS)('yomureader.com visitor from v1.9.3: $scenario', fixture => {
    it.each(Object.keys(fixture.expected))('website only: %s boots with what v1.9.3 showed', async href => {
        enterHostedWithoutInstall(href, fixture.webStorage);
        await loadReaderStartupSettings();
        await expectSameAsV193(fixture.expected[href]);
    });

    it('website only: a later Settings Save on hosted Study is not wedged', async () => {
        enterHostedWithoutInstall(HOSTED_STUDY_URL, fixture.webStorage);
        const current = await loadSettings();
        await expect(saveSettings({ ...current, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] })).resolves.toBeUndefined();
        resetManagedStateEpochSessionsForTests();
        await expect(loadSettings()).resolves.toMatchObject({ theme: 'light' });
    });

    it('userscript installed under v1.9.3: hosted Study and an ordinary site keep what v1.9.3 showed', async () => {
        const after = fixture.afterUserscriptInstall;
        const gm = createStore(after.gm);
        enterHostedStudyWithUserscript(gm, after.webStorage);
        await expectSameAsV193(after.expected[HOSTED_STUDY_URL]);
        const site = SITE_AFTER_INSTALL(fixture);
        enterUserscriptSite(gm, site, after.webStorage);
        await expectSameAsV193(after.expected[site]);
    });

    it('userscript installed after the 2.0 update: hosted Study shows what the 1.9.3 install showed', async () => {
        enterHostedStudyWithUserscript(createStore(), fixture.webStorage);
        await expectSameAsV193(fixture.afterUserscriptInstall.expected[HOSTED_STUDY_URL]);
    });
});

// ---------------------------------------------------------------------------
// (f, f2) backups exported by v1.9.3
// ---------------------------------------------------------------------------

function freshDictionaries(): YomitanDictionaryStore {
    vi.stubGlobal('indexedDB', new IDBFactory());
    return new YomitanDictionaryStore();
}

describe('settings backup file exported by v1.9.3: f-backup-file-v1.9.3', () => {
    const fixture = corpus<BackupFixture>('f-backup-file-v1.9.3.json');
    const fileText = corpusText(fixture.file);

    it('is recognised as a current-format backup, retired key and seq-0 ledger included', () => {
        expect(fixture.storageKeys).toContain('yomu:explicit-user-settings:v1');
        expect(parseReaderSettingsBackup(JSON.parse(fileText))).not.toBeNull();
    });

    it('imports on a fresh install with the settings and dictionary v1.9.3 restored', async () => {
        enterUserscriptSite(createStore(), 'https://www.example.com/articles/yomu-upgrade');
        const dictionaries = freshDictionaries();
        await restoreReaderSettingsBackup(
            new File([fileText], fixture.file.split('/').pop()!, { type: 'application/json' }),
            await loadSettings(),
            {
                dictionaries,
                setStatus: () => undefined,
                persistSettings: saveSettings,
                adoptSettings: () => undefined,
                dictionaryStateChanged: () => undefined,
            },
        );
        resetManagedStateEpochSessionsForTests();
        await expectSameAsV193(fixture.expected);
        const summary = await dictionaries.summary();
        expect(summary.dictionaries.map(entry => entry.title)).toEqual(fixture.expected.dictionaries);
    });
});

describe('Google Drive snapshot uploaded by v1.9.3: f2-cloud-snapshot-v1.9.3', () => {
    const fixture = corpus<BackupFixture>('f2-cloud-snapshot-v1.9.3.json');
    const extension = corpus<ExtensionFixture>('d-extension-study-and-content-script.json');
    const snapshot = JSON.parse(corpusText(fixture.file)) as { settings: Partial<ReaderSettings>; storage?: unknown };

    it('passes the cloud envelope check', () => {
        expect(() => validateCloudSettingsEnvelope(snapshot)).not.toThrow();
    });

    it('restores into a fresh packaged Study with the settings v1.9.3 restored', async () => {
        enterPackagedStudy(createStore(), extension);
        const before = await loadSettings();
        let imported = normalizeReaderSettings({ ...before, ...snapshot.settings, shortcuts: { ...before.shortcuts, ...snapshot.settings.shortcuts } });
        await runSettingsRestoreTransaction({
            storage: validateCloudSettingsEnvelope(snapshot).storage,
            prepareSettings: view => { imported = witnessedSettingsRestoreCandidate(before, imported, view); },
            publishSettings: view => saveSettings(imported, settingsRestoreSaveOptions(before, imported, view)),
        });
        resetManagedStateEpochSessionsForTests();
        await expectSameAsV193(fixture.expected);
    });
});

// ---------------------------------------------------------------------------
// (g) dictionaries v1.9.3 imported, per channel
// ---------------------------------------------------------------------------

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Rebuilds the exact database v1.9.3 left on disk. */
async function restoreDatabase(factory: IDBFactory, dump: IndexedDbChannel['dictionaryDatabase']): Promise<void> {
    const open = factory.open(dump.name, dump.version);
    open.onupgradeneeded = () => {
        for (const store of dump.stores) {
            const created = open.result.createObjectStore(store.name, {
                keyPath: store.keyPath ?? undefined,
                autoIncrement: store.autoIncrement,
            });
            for (const index of store.indexes) {
                created.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
            }
        }
    };
    const db = await idbRequest(open);
    const tx = db.transaction(dump.stores.map(store => store.name), 'readwrite');
    for (const store of dump.stores) {
        const target = tx.objectStore(store.name);
        for (const record of store.records) {
            if (store.keyPath === null) target.put(record.value, record.key);
            else target.put(record.value);
        }
    }
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

const INDEXED_DB = corpus<IndexedDbFixture>('g-indexeddb-per-channel.json');
const CHANNEL_REALMS: Record<string, (href: string) => void> = {
    'userscript-site': href => enterUserscriptSite(createStore(), href),
    'userscript-hosted-study': () => enterHostedStudyWithUserscript(createStore()),
    'hosted-standalone-study': href => enterHostedWithoutInstall(href),
    'extension-origin': () => enterPackagedStudy(createStore(), corpus<ExtensionFixture>('d-extension-study-and-content-script.json')),
};

describe.each(Object.entries(INDEXED_DB.channels))('dictionary imported by v1.9.3 in channel %s', (channel, observed) => {
    it(`is still listed and found by v2 (v1.9.3 stored it in "${observed.dictionaries}")`, async () => {
        const factory = new IDBFactory();
        await restoreDatabase(factory, observed.dictionaryDatabase);
        CHANNEL_REALMS[channel](observed.location);
        vi.stubGlobal('indexedDB', factory);
        const store = new YomitanDictionaryStore();
        const summary = await store.summary();
        expect(summary.dictionaries.map(entry => entry.title)).toEqual([INDEXED_DB.dictionaryTitle]);
        const found = await store.lookup('読む', 'よむ', 5);
        expect(found.map(entry => entry.glossary)).toEqual(observed.lookupGlossary);
    });
});

