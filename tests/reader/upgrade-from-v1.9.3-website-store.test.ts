// The v1.9.3 Website-only Store meeting a Reader installed after the update.
//
// v1.9.3 promoted a yomureader.com visitor's page-local settings and progress
// into a freshly installed Reader, and mirrored the installed store back into
// the page. v2 keeps the first half only (ADR-0017): the website store is
// adopted only into missing keys while the installed store has no explicit
// settings intent. Settings and their ledger stay paired; existing records are
// never overwritten, and nothing is written back into the website. These cases
// are v2 contracts, so they live outside the corpus self-check file.
import 'fake-indexeddb/auto';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markInstalledReaderRuntime } from '../../src/reader/app/runtime-presence';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { clearManagedStoredValues, commitManagedStateResetEpoch, exportManagedStoredValues } from '../../src/reader/app/storage';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/reader/settings';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { LocalYomuSrsStore } from '../../src/reader/srs/local-yomu-store';
import type { StoredYomuSrsCard } from '../../src/reader/srs/local-yomu-deck';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';
import { v193Corpus } from './helpers/upgrade-v193-corpus';

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
