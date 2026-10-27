// Filesystem/subprocess inputs, including generic helpers called by this test.
// @yomu-reads scripts/lib/hosted-appearance-settings.cjs
// @yomu-imports src/reader/settings/hosted-appearance-settings.ts
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
import { DEFAULT_SETTINGS, effectiveFuriganaMode, furiganaStyle, loadSettings, normalizeReaderSettings, saveSettings } from '../../src/reader/settings';
import { loadReaderStartupSettings } from '../../src/reader/app/startup';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { ensureExtensionStudySettingsAuthority } from '../../src/reader/newtab/extension-settings-recovery-guard';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';
import { parseReaderSettingsBackup } from '../../src/reader/settings/file-io';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { readFormSettings } from '../../src/reader/settings/form-read';
import { annotationPowerState, toggleFuriganaSettings } from '../../src/reader/app/annotation-power-policy';
import { restoreReaderSettingsBackup } from '../../src/reader/settings/reader-settings-restore-adapter';
import { validateCloudSettingsEnvelope } from '../../src/reader/settings/cloud-settings-envelope';
import {
    runSettingsRestoreTransaction,
    settingsRestoreSaveOptions,
    witnessedSettingsRestoreCandidate,
} from '../../src/reader/settings/settings-restore-transaction';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { execFileSync } from "node:child_process";
import { markInstalledReaderRuntime } from "../../src/reader/app/runtime-presence";
import { clearManagedStoredValues, commitManagedStateResetEpoch, exportManagedStoredValues } from "../../src/reader/app/storage";
import { serializeSettingsPersistencePair } from "../../src/reader/settings/settings-persistence-transaction";
import { LocalYomuSrsStore } from "../../src/reader/srs/local-yomu-store";
import type { StoredYomuSrsCard } from "../../src/reader/srs/local-yomu-deck";
import { v193Corpus } from "./helpers/upgrade-v193-corpus";
import { NewTabGradeQueue, type NewTabGradeQueueDeps, type QueuedNewTabGrade } from "../../src/reader/newtab/grade-queue";
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from "../../src/reader/newtab/controller-config";
import type { JPDBCard } from "../../src/reader/app/types";
import { memoryLegacyStorage, reviewQueueHostFixture } from "./helpers/review-queue-host-fixture";

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

// Current display of the recorded defaults: 2.1 retired the green accent;
// 2.2 makes an unchosen 28px caption default automatic. Explicit sizes in
// this corpus are 40px and remain exact; historical fixture bytes stay intact.
function shownByCurrent(settings: Record<string, unknown>): Record<string, unknown> {
    const shown = visibleSettings(settings);
    if (shown.accentColor === '#5ea780') shown.accentColor = '#b8324e';
    if (shown.subtitleFontSize === 28) shown.subtitleFontSize = 0;
    return shown;
}

function targetLanguage(settings: ReaderSettings): string | null {
    const profiles = (settings as { languageProfiles?: Array<{ id?: string; targetLanguage?: string }> }).languageProfiles ?? [];
    return profiles.find(profile => profile.id === settings.activeLanguageProfileId)?.targetLanguage ?? null;
}

/** Loads settings the way v2 boots and compares with what v1.9.3 showed. */
async function expectSameAsV193(expected: Visible): Promise<ReaderSettings> {
    const settings = await loadSettings();
    expect(visibleSettings(settings)).toEqual(shownByCurrent(expected.settings));
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
    expect(visibleSettings(reloaded)).toEqual({ ...shownByCurrent(expected.settings), subtitleFontSize: 44 });
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

    // 2.1 moved "Yomu on/off", "furigana shown/hidden" and Request Japanese
    // sites out of Settings into the puck and toolbar. The choices this backup
    // carries (furigana hidden, Japanese sites requested) must survive both the
    // import and a later Settings Save that no longer renders those controls.
    it('keeps its reading state through import and a later Settings Save', async () => {
        // The archived ledger declares hidden readings, but never chose All:
        // its stored All is an old default, so only the style may adopt 2.1's.
        const archived = JSON.parse(fileText);
        const archivedIntent = archived.storage['yomu:settings-intent:v2'].records;
        expect(archived.settings.furiganaMode).toBe('all');
        expect(archivedIntent.showFurigana.value).toBe(false);
        expect(archivedIntent).not.toHaveProperty('furiganaMode');
        enterUserscriptSite(createStore(), 'https://www.example.com/articles/yomu-upgrade');
        await restoreReaderSettingsBackup(
            new File([fileText], fixture.file.split('/').pop()!, { type: 'application/json' }),
            await loadSettings(),
            {
                dictionaries: freshDictionaries(),
                setStatus: () => undefined,
                persistSettings: saveSettings,
                adoptSettings: () => undefined,
                dictionaryStateChanged: () => undefined,
            },
        );
        resetManagedStateEpochSessionsForTests();
        const restored = await loadSettings();
        expect(annotationPowerState(restored)).toBe('on');
        expect(restored.preferJapaneseSiteLanguage).toBe(true);
        expect(effectiveFuriganaMode(restored)).toBe('off');
        expect(restored.furiganaMode).toBe(DEFAULT_SETTINGS.furiganaMode);

        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(restored, 'https://jpdb.io/settings');
        expect(form.querySelector('[name="preferJapaneseSiteLanguage"]')).toBeNull();
        expect(form.querySelector('input[name="pageScanMode"][value="off"]')).toBeNull();
        expect(form.querySelector('select[name="furiganaMode"] option[value="off"]')).not.toBeNull();
        expect(form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!.value).toBe('off');

        const untouched = readFormSettings(new FormData(form), restored);
        expect(annotationPowerState(untouched)).toBe('on');
        expect([untouched.showFurigana, untouched.furiganaMode, untouched.preferJapaneseSiteLanguage, untouched.annotationsPaused])
            .toEqual([false, 'off', true, false]);
        await saveSettings(untouched, { explicitUserChoiceKeys: [] });
        resetManagedStateEpochSessionsForTests();
        const afterSave = await loadSettings();
        expect(effectiveFuriganaMode(afterSave)).toBe('off');
        expect(annotationPowerState(afterSave)).toBe('on');
        expect(afterSave.preferJapaneseSiteLanguage).toBe(true);

        // Selecting a visible mode in Settings turns readings back on.
        form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')!.value = 'all';
        const restyled = readFormSettings(new FormData(form), restored);
        expect(annotationPowerState(restyled)).toBe('on');
        expect(restyled.puckFuriganaModeBeforeHide).toBe('');
        await saveSettings(restyled, { explicitUserChoiceKeys: ['showFurigana', 'furiganaMode', 'puckFuriganaModeBeforeHide'] });
        resetManagedStateEpochSessionsForTests();
        const reloaded = await loadSettings();
        expect(effectiveFuriganaMode(reloaded)).toBe('all');
        expect(annotationPowerState(reloaded)).toBe('on');
        expect(furiganaStyle(reloaded)).toBe('all');
        expect(toggleFuriganaSettings(reloaded)).toMatchObject({ furiganaMode: 'off', puckFuriganaModeBeforeHide: 'all' });
        expect(corpusText(fixture.file)).toBe(fileText);
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


describe("upgrade from v1.9.3 website store", () => {
    // The v1.9.3 Website-only Store meeting a Reader installed after the update.
    //
    // v1.9.3 promoted a yomureader.com visitor's page-local settings and progress
    // into a freshly installed Reader, and mirrored the installed store back into
    // the page. v2 keeps the first half only (ADR-0017): the website store is
    // adopted only into missing keys while the installed store has no explicit
    // settings intent. Settings and their ledger stay paired; existing records are
    // never overwritten, and nothing is written back into the website. These cases
    // are v2 contracts, so they live outside the corpus self-check file.














    type WebStorage = Record<string, string>;

    const STUDY_URL = 'https://yomureader.com/study/';
    const GM_API = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'] as const;
    const WEBSITE_ONLY = v193Corpus<{ webStorage: Record<string, WebStorage> }>('e4-hosted-study-website-only.json')
        .webStorage['https://yomureader.com'];
    const INSTALLED = v193Corpus<{ gm: Record<string, unknown>; expected: { settings: Record<string, unknown> } }>('a-userscript-explicit-save.json');
    const INSTALLED_WITH_INTENT = INSTALLED.gm;
    const LEARNER_CARD: StoredYomuSrsCard = {
        id: '読む', expression: '読む', reading: 'よむ', meanings: ['to read'], dueAt: 9_000, lastReviewAt: 2_000,
        createdAt: 1_000, updatedAt: 2_000, reviews: 4, lapses: 0, intervalDays: 3, ease: 2.5,
    };

    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        document.getElementById('jpdb-reader-installed-runtime')?.remove();
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    function jsonClone<T>(value: T): T {
        return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
    }

    /** A new page load on hosted Study with this origin's recorded page storage. */
    function newStudyPageLoad(webStorage: WebStorage): void {
        uninstallUserscriptGmStorageBridge();
        resetManagedStateEpochSessionsForTests();
        resetManagedWebStorageForTests();
        document.getElementById('jpdb-reader-installed-runtime')?.remove();
        for (const name of [...GM_API, 'chrome'] as const) vi.stubGlobal(name, undefined);
        vi.stubGlobal('location', new URL(STUDY_URL));
        localStorage.clear();
        sessionStorage.clear();
        for (const [key, value] of Object.entries(webStorage)) localStorage.setItem(key, value);
        document.documentElement.dataset.yomuHosted = '';
    }

    /** The installed Reader's isolated world announces itself and bridges its GM store to the page. */
    function withInstalledReader(kind: 'userscript' | 'extension', store: Map<string, unknown>): void {
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (store.has(key) ? jsonClone(store.get(key)) : fallback));
        vi.stubGlobal('GM_setValue', (key: string, value: unknown) => { store.set(key, jsonClone(value)); });
        vi.stubGlobal('GM_deleteValue', (key: string) => { store.delete(key); });
        vi.stubGlobal('GM_listValues', () => [...store.keys()]);
        if (kind === 'extension') vi.stubGlobal('chrome', { runtime: { id: 'yomu@yomureader.com' } });
        markInstalledReaderRuntime(kind);
        installUserscriptGmStorageBridge();
        for (const name of [...GM_API, 'chrome'] as const) vi.stubGlobal(name, undefined);
    }

    function pageStorage(): WebStorage {
        const entries: WebStorage = {};
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index)!;
            entries[key] = localStorage.getItem(key)!;
        }
        return entries;
    }

    /** The website's own records: an installed Reader keeps its page cache in its own namespace. */
    function websiteRecords(storage: WebStorage): WebStorage {
        return Object.fromEntries(Object.entries(storage).filter(([key]) => !key.startsWith('yomu:web-owner:v2:')));
    }

    /** Page load 1 on yomureader.com without an install: the v1.9.3 visitor also saves a local card. */
    async function websiteOnlyLearner(): Promise<WebStorage> {
        newStudyPageLoad(WEBSITE_ONLY);
        const store = new LocalYomuSrsStore();
        await store.write(await store.read(), { version: 1, cards: { 読む: LEARNER_CARD }, tombstones: {} });
        return pageStorage();
    }

    async function cardExpressions(): Promise<string[]> {
        return Object.values((await new LocalYomuSrsStore().read()).cards).map(card => card.expression);
    }

    // What 2.1 loads for a v1.9.3 record: every retained key as stored, except the
    // retired green default accent, which reads as the brand red.
    function retainedExpectedSettings(settings: Record<string, unknown>): Record<string, unknown> {
        const retained = Object.fromEntries(Object.entries(settings).filter(([key]) => Object.hasOwn(DEFAULT_SETTINGS, key)));
        return retained.accentColor === '#5ea780' ? { ...retained, accentColor: '#b8324e' } : retained;
    }

    describe('website-only store when a Reader is installed after the update', () => {
        it('follows the learner into a freshly installed extension, including its backup', async () => {
            const website = await websiteOnlyLearner();
            newStudyPageLoad(website);
            withInstalledReader('extension', new Map());

            await expect(loadSettings()).resolves.toMatchObject({
                apiKey: 'corpus0000000000000000000000jpdb', theme: 'dark',
            });
            expect(await cardExpressions()).toEqual(['読む']);
            await expect(exportManagedStoredValues()).resolves.toMatchObject({
                'yomu:srs-local:v2:index': { cardIds: [expect.any(String)] },
                'jpdb-popup-reader-settings': { apiKey: 'corpus0000000000000000000000jpdb', theme: 'dark' },
            });
            expect(websiteRecords(pageStorage())).toEqual(websiteRecords(website));
        });

        it('never replaces or merges an installed Reader with explicit settings intent', async () => {
            const website = await websiteOnlyLearner();
            newStudyPageLoad(website);
            const installed = new Map(Object.entries(jsonClone(INSTALLED_WITH_INTENT)));
            withInstalledReader('userscript', installed);

            await expect(loadSettings()).resolves.toMatchObject(retainedExpectedSettings(INSTALLED.expected.settings));
            expect(await cardExpressions()).toEqual([]);
            expect(await exportManagedStoredValues()).not.toHaveProperty('yomu:srs-local:v2:index');
            expect(Object.fromEntries(installed)).toEqual(INSTALLED_WITH_INTENT);
            expect(websiteRecords(pageStorage())).toEqual(websiteRecords(website));
        });

        it('fills only the keys an installed store that says no target was chosen lacks', async () => {
            const website = await websiteOnlyLearner();
            newStudyPageLoad(website);
            const unchosen = { learningTargetChosen: false, onboardingSeen: false, theme: 'light' };
            const installed = new Map<string, unknown>([['jpdb-popup-reader-settings', unchosen]]);
            withInstalledReader('extension', installed);

            expect(await cardExpressions()).toEqual(['読む']);
            expect(installed.get('jpdb-popup-reader-settings')).toEqual(unchosen);
            expect(installed.has('yomu:settings-intent:v2')).toBe(false);
            expect(websiteRecords(pageStorage())).toEqual(websiteRecords(website));
        });

        it('keeps existing settings but adopts missing cards when no settings intent was recorded', async () => {
            const website = await websiteOnlyLearner();
            newStudyPageLoad(website);
            const preFlag = { theme: 'light', interfaceLanguage: 'ja' };
            const installed = new Map<string, unknown>([['jpdb-popup-reader-settings', preFlag]]);
            withInstalledReader('userscript', installed);

            expect(await cardExpressions()).toEqual(['読む']);
            expect(await exportManagedStoredValues()).toHaveProperty('yomu:srs-local:v2:index');
            expect(installed.get('jpdb-popup-reader-settings')).toEqual(preFlag);
            expect(installed.has('yomu:settings-intent:v2')).toBe(false);
            expect(websiteRecords(pageStorage())).toEqual(websiteRecords(website));
        });

        it('protects current installed intent without relying on any retired target flag', async () => {
            const website = await websiteOnlyLearner();
            newStudyPageLoad(website);
            const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, theme: 'light' }, {
                revision: 1, records: { theme: { seq: 1, value: 'light' } },
            });
            const installed = new Map<string, unknown>(Object.entries(jsonClone(pair)));
            withInstalledReader('userscript', installed);

            expect(await cardExpressions()).toEqual([]);
            await expect(loadSettings()).resolves.toMatchObject({ theme: 'light' });
            expect(Object.fromEntries(installed)).toEqual(pair);
            expect(websiteRecords(pageStorage())).toEqual(websiteRecords(website));
        });

        it('is erased by a factory reset from the installed Reader and does not return', async () => {
            const website = await websiteOnlyLearner();
            const installed = new Map<string, unknown>();
            newStudyPageLoad(website);
            withInstalledReader('extension', installed);
            await loadSettings();
            await clearManagedStoredValues();
            await commitManagedStateResetEpoch('website-store-reset');

            newStudyPageLoad(pageStorage());
            withInstalledReader('extension', installed);
            expect(Object.keys(pageStorage()).filter(key => /^(?:yomu|jpdb)/.test(key) && !key.startsWith('yomu:web-owner:v2:'))).toEqual([]);
            const resetSettings = await loadSettings();
            expect(resetSettings).toMatchObject({ apiKey: DEFAULT_SETTINGS.apiKey, theme: DEFAULT_SETTINGS.theme });
            expect(resetSettings).not.toHaveProperty('learningTargetChosen');
            expect(resetSettings).not.toHaveProperty('onboardingSeen');
            expect(await cardExpressions()).toEqual([]);
        });
    });

    describe('pre-startup hosted appearance module', () => {
        // Adoption sits on the storage read path, which the appearance module bundles;
        // resolving storage authority must not pull the removed target registry in with it.
        it('stays free of the language graph', () => {
            const source = execFileSync(process.execPath, ['-e',
                'process.stdout.write(require("./scripts/lib/hosted-appearance-settings.cjs").buildHostedAppearanceSettings(process.cwd()).source)',
            ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
            expect(source).toContain('// src/reader/app/website-store-adoption.ts');
            expect(source).not.toContain('// src/reader/languages/');
        });
    });
});

describe('a leftover v1.9.3 offline review queue', () => {
    // Bytes the released v1.9.3 NewTabGradeQueue wrote (captured by running v1.9.3 source):
    // a stale-account JPDB grade, JPDB and Jiten grades that failed twice, an Anki grade
    // whose flush failed once with Anki closed, and a local Academy grade.
    const fixture = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'fixtures', 'upgrade-v1.9.3', 'grade-queue-v1.9.3.json'), 'utf8')) as {
        key: string;
        providerContexts: { current: { jpdb: string; jiten: string; anki: string }; staleJpdb: string };
        value: QueuedNewTabGrade[];
    };
    const contexts = fixture.providerContexts.current;
    const providerContextForTarget: NewTabGradeQueueDeps['providerContextForTarget'] = target => target === 'anki' ? contexts.anki
        : target === 'jiten-api' ? contexts.jiten : target === 'jpdb-api' ? contexts.jpdb : '';
    const deliverableSpellings = ['読む', '見る', '書く', '話す'];
    const unrelated = { vid: 9, sid: 9, spelling: '新しい', reading: 'あたらしい' } as JPDBCard;

    function submitted(submit: { mock: { calls: unknown[][] } }): string[] {
        return submit.mock.calls.map(([item]) => (item as QueuedNewTabGrade).card.spelling).sort();
    }

    afterEach(() => { vi.unstubAllGlobals(); });


    it('is the real v1.9.3 byte shape these tests replay', () => {
        expect(fixture.key).toBe(NEW_TAB_GRADE_QUEUE_KEY);
        expect(fixture.value.map(item => [item.target, item.attempts, item.card.spelling])).toEqual([
            ['jpdb-api', 0, '昔'], ['jpdb-api', 2, '読む'], ['jiten-api', 2, '見る'], ['anki', 1, '書く'], ['yomu-local', 0, '話す'],
        ]);
        expect(fixture.value.find(item => item.target === 'anki')).toMatchObject({ lastError: 'Failed to fetch' });
    });

    it('is adopted once by packaged Study, delivered exactly once, and never blocks another card', async () => {
        const host = reviewQueueHostFixture();
        const legacy = memoryLegacyStorage(fixture.value);
        const submit = vi.fn(async () => true);
        const onSubmitted = vi.fn();
        const make = () => new NewTabGradeQueue({ owner: host.client(), storage: legacy, submit, onSubmitted,
            offlineEnabled: () => true, providerContextForTarget });
        const first = make();
        expect(await first.flush()).toBe(1);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
        expect(onSubmitted).toHaveBeenCalledTimes(4);
        expect(first.blocksReview(unrelated)).toBe(false);
        expect(await first.heldReviews()).toHaveLength(0);
        // The stale-account grade keeps its 1.9.3 status: waiting for that account, blocking nothing.
        expect(await host.client().list()).toMatchObject([{ card: { spelling: '昔' }, providerContext: fixture.providerContexts.staleJpdb, attempts: 0 }]);
        expect(first.blocksReview(fixture.value[0]!.card)).toBe(false);

        expect(await make().flush()).toBe(1);
        expect(submit).toHaveBeenCalledTimes(4);
        expect(await first.enqueue(unrelated, 'okay', ['jpdb-api'])).toBe(true);
        expect(await host.client().list()).toMatchObject([{ card: { spelling: '昔' } }, { card: { spelling: '新しい' }, attempts: 0 }]);
    });

    it('is delivered exactly once when the adoption reply is lost', async () => {
        const host = reviewQueueHostFixture();
        const legacy = memoryLegacyStorage(fixture.value);
        let loseAdoptReply = true;
        const lossy = host.client(async request => {
            const reply = await host.send(request);
            if (request.kind === 'adopt' && loseAdoptReply) { loseAdoptReply = false; throw new Error('adopt reply lost'); }
            return reply;
        });
        const submit = vi.fn(async () => true);
        const make = (owner = lossy) => new NewTabGradeQueue({ owner, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        const queue = make();
        expect(await queue.flush()).toBe(1);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(queue.blocksReview(unrelated)).toBe(false);
        expect(await make(host.client()).flush()).toBe(1);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
    });

    it('keeps entries the owner cannot hold, and never lets a failed hand-over lock Study', async () => {
        const host = reviewQueueHostFixture();
        const unreadable = { ...fixture.value[1]!, id: 'jpdb-api:no-reading', card: { spelling: '無' } as JPDBCard };
        const legacy = memoryLegacyStorage([unreadable, fixture.value[4]]);
        let ownerReachable = false;
        const owner = host.client(async request => {
            if (request.kind === 'adopt' && !ownerReachable) return { ok: false, error: 'Stored review queue is invalid; no reviews were changed.' };
            return host.send(request);
        });
        const submit = vi.fn(async () => true);
        const queue = new NewTabGradeQueue({ owner, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        expect(await queue.flush()).toBe(0);
        expect(queue.blocksReview(unrelated)).toBe(false);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toHaveLength(2);
        expect(submit).not.toHaveBeenCalled();
        ownerReachable = true;
        expect(await queue.flush()).toBe(0);
        expect(submitted(submit)).toEqual(['話す']);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toEqual([unreadable]);
        expect(queue.blocksReview(unrelated)).toBe(false);
    });

    it('never takes the owner past capacity: what does not fit waits in the key and never locks Study', async () => {
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const host = reviewQueueHostFixture();
        const entry = (n: number): QueuedNewTabGrade => ({ ...fixture.value[1]!, id: `jpdb-api:backlog-${n}`, at: 1_000 + n,
            card: { vid: 1_000 + n, sid: 1, spelling: `語${n}`, reading: `ご${n}` } as JPDBCard });
        const legacy = memoryLegacyStorage(Array.from({ length: 150 }, (_, n) => entry(n)));
        const submit = vi.fn(async (_item: QueuedNewTabGrade) => true);
        const make = () => new NewTabGradeQueue({ owner: host.client(), storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        expect(await make().flush()).toBe(150);
        // Hosted Study, sharing this store through the extension storage bridge, queued 100 more while offline.
        legacy.values.set(NEW_TAB_GRADE_QUEUE_KEY, Array.from({ length: 100 }, (_, n) => entry(500 + n)));
        const tab = make();
        expect(await tab.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(await tab.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        const fresh = make();
        expect(await fresh.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(fresh.blocksReview(unrelated)).toBe(false);
        expect(await host.client().list()).toHaveLength(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY)).toHaveLength(50);
        expect(submit).not.toHaveBeenCalled();

        // Back online, the owner drains and then takes the rest: all 250 land exactly once.
        vi.stubGlobal('navigator', { ...navigator, onLine: true });
        expect(await fresh.flush()).toBe(0);
        expect(await fresh.flush()).toBe(0);
        expect(legacy.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
        expect(new Set(submit.mock.calls.map(([item]) => item.id)).size).toBe(250);
        expect(submit).toHaveBeenCalledTimes(250);
    });

    it('is retried with 1.9.3 semantics by userscript and hosted Study, delivered once, and re-gradable', async () => {
        const legacy = memoryLegacyStorage(fixture.value);
        const submit = vi.fn(async () => true);
        const make = () => new NewTabGradeQueue({ owner: null, storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget });
        const queue = make();
        // The 1.9.3 Anki entry with attempts 1 was an ordinary retry, not an uncertain dispatch.
        expect(await queue.heldReviews()).toHaveLength(0);
        expect(await queue.flush()).toBe(1);
        expect(submitted(submit)).toEqual([...deliverableSpellings].sort());
        expect(await make().flush()).toBe(1);
        expect(submit).toHaveBeenCalledTimes(4);
        expect((legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY) as QueuedNewTabGrade[]).map(item => item.card.spelling)).toEqual(['昔']);
        expect(await queue.enqueue(fixture.value[3]!.card, 'easy', ['anki'])).toBe(true);
    });
});
