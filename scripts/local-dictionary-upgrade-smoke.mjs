#!/usr/bin/env node
// Regression smoke: importing a newer revision of an installed dictionary
// ("Jitendex.org [2026-06-06]" over "[2026-05-05]") must behave as an
// upgrade — one settings row carrying the old row's rank, and a lookup source
// card for the new revision. Before 1.6.232 the old row lingered as an enabled
// source that could never render (user-reported: settings listed six sources,
// the popover showed none of them).
//
// Since 1.9.1 an ordinary page never shows the settings form or its dictionary
// import; sensitive setup opens on Study. So the import runs where a learner
// runs it: hosted Study (dist/newtab, served at its real https://yomureader.com
// URL) with the userscript installed, opened through a #settings= link as the
// off-site Settings launcher opens it. A userscript's dictionary lives on the
// origin that imported it, so the upgraded revision is looked up in Study too.
// Runs in Firefox by default (the report came from Firefox);
// YOMU_SMOKE_BROWSER=chromium switches engines.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    addGmStorageBridgeInitScript,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    installGmStorageBridgeOnCurrentPage,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    addUserscriptGraphInitScripts,
    installUserscriptCssResource,
    userscriptCompanionPaths,
} from './lib/smoke-test-helpers.mjs';
import { yomitanDatabaseName } from './lib/yomitan-database-name.mjs';
import { yomitanZipBuffer } from './lib/yomitan-zip.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const STUDY_URL = 'https://yomureader.com/study/';
const STUDY_ORIGIN = new URL(STUDY_URL).origin;
const PAGE_PATH = '/local-dictionary-upgrade.html';
const SENTENCE = '図書館で漢字を調べています。';
const LOOKUP_WORD = '図書館';
const MAY_TITLE = 'Jitendex.org [2026-05-05]';
const JUNE_TITLE = 'Jitendex.org [2026-06-06]';
const REQUEST_BRIDGE_NAME = '__yomuLocalDictionaryUpgradeRequest';
// The GM store lives apart from the Study page's own localStorage, as a
// manager's does; one namespace would let the website store stand in for it.
const GM_STORAGE_PREFIX = '__yomu_local_dictionary_upgrade_gm__:';
const BROWSER_NAME = process.env.YOMU_SMOKE_BROWSER === 'chromium' ? 'chromium' : 'firefox';

const settings = {
    onboardingSeen: true,
    learningTargetChosen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    showFloatingButton: false,
    lookupOnClick: true,
    popupActivationMode: 'click',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};
// The Reader commits settings together with its intent ledger. Seeding only
// the settings value again on a later load would tear that pair, so seed once.
const gmBridgeOptions = {
    key: YOMU_SETTINGS_KEY,
    value: settings,
    requestBridgeName: REQUEST_BRIDGE_NAME,
    storagePrefix: GM_STORAGE_PREFIX,
    initialize: 'ifMissing',
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>local dictionary upgrade smoke</title></head>
<body><main style="max-width:720px;margin:48px auto;font:20px/1.8 system-ui"><p data-smoke-sentence>${SENTENCE}</p></main></body></html>`);
}, 'Could not bind local dictionary upgrade smoke server');
const browser = await launchSmokeBrowser(BROWSER_NAME === 'chromium' ? chromium : firefox, BROWSER_NAME, { headless: true });

try {
    const study = await importRevisionsOnStudy();
    const offSite = await verifyOrdinarySiteHasNoCopy(study.gmValues);
    const report = { ok: true, browser: BROWSER_NAME, preferences: study.preferences, dom: study.dom, screenshot: study.screenshot, offSite };
    writeFileSync(path.join(ARTIFACTS, `local-dictionary-upgrade-${BROWSER_NAME}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('local-dictionary-upgrade smoke passed');
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function importRevisionsOnStudy() {
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1100, height: 900 } });
    // Deterministic and offline: Study's own files come from the build, every
    // other host answers 503.
    await context.route(url => url.origin !== STUDY_ORIGIN, route => route.fulfill({ status: 503, contentType: 'text/plain', body: '' }));
    await context.route(`${STUDY_ORIGIN}/**`, route => fulfillStudyAsset(route));
    const page = await context.newPage();
    attachDebugLogging(page, 'study');
    await page.exposeFunction(REQUEST_BRIDGE_NAME, () => ({ status: 503, responseText: '' }));
    await addGmStorageBridgeInitScript(page, { ...gmBridgeOptions, css: readFileSync(CSS_PATH, 'utf8') });
    // At document start, as a userscript manager runs it, so the installed
    // Reader announces itself before Study's own scripts.
    await addUserscriptGraphInitScripts(page, SCRIPT_PATH);

    await page.goto(`${STUDY_URL}#settings=backup`, { waitUntil: 'domcontentloaded' });
    await page.locator('.jpdb-reader-settings [data-action="import-yomitan-dictionary"]').waitFor({ state: 'visible', timeout: 30_000 });

    // May first, so June arrives as a newer revision of an installed dictionary.
    // Which customizations June inherits is pinned by
    // tests/reader/dictionary-preference-upgrade.test.ts.
    await importDictionary(page, MAY_TITLE, 'library (May)');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));
    await importDictionary(page, JUNE_TITLE, 'library (June)');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));

    const gmValues = await readGmValues(page);
    const preferences = JSON.parse(gmValues[YOMU_SETTINGS_KEY] ?? '{}').dictionaryPreferences ?? [];
    const jitendexRows = preferences.filter(row => /^Jitendex\.org /.test(row.name));
    assert(jitendexRows.length === 1, 'Revision upgrade left more than one Jitendex settings row', preferences);
    assert(jitendexRows[0].name === JUNE_TITLE, 'Settings row does not point at the imported revision', jitendexRows);
    const archiveIndex = gmValues['yomu-dictionary-archives'] ? JSON.parse(gmValues['yomu-dictionary-archives']) : null;
    assert(archiveIndex && archiveIndex['jitendex.org'], 'Import did not persist a cross-origin dictionary archive', Object.keys(gmValues));

    // Fresh load: looking the word up must render the upgraded dictionary as
    // its one local source.
    await page.goto(`${STUDY_URL}?q=${encodeURIComponent(LOOKUP_WORD)}`, { waitUntil: 'domcontentloaded' });
    const result = page.locator(`[data-newtab-action="search-result-word"][data-expression="${LOOKUP_WORD}"]`).first();
    await result.waitFor({ state: 'visible', timeout: 30_000 });
    await result.click();
    // Every result owns a detail slot; only the opened card's slot is filled.
    const detail = page.locator('[data-newtab-search-card-shell][data-newtab-search-expanded="true"] [data-newtab-search-detail]');
    // Other provider sections can precede this card, so a prefix of the whole
    // detail is not evidence that the upgraded definition is absent.
    const upgradedCard = detail.locator(`[data-source="local-dictionary"][data-dictionary="${JUNE_TITLE}"]`);
    await upgradedCard.waitFor({ state: 'attached', timeout: 15_000 });
    const upgradedDefinitions = upgradedCard.locator('[data-definition-translation-text]', { hasText: 'library (June)' });
    await upgradedDefinitions.waitFor({ state: 'attached', timeout: 15_000 });

    const dom = {
        dictionary: await upgradedCard.getAttribute('data-dictionary'),
        headword: await upgradedCard.getAttribute('data-card-highlight-spelling'),
        title: (await upgradedCard.locator('summary').innerText()).replace(/\s+/g, ' ').trim(),
        definitions: (await upgradedDefinitions.innerText()).replace(/\s+/g, ' ').trim(),
    };
    const dictionaryCards = await detail.locator('[data-source="local-dictionary"]').count();
    assert(dom.headword === LOOKUP_WORD, 'Study opened a different word than the one looked up', dom);
    assert(dictionaryCards === 1 && dom.dictionary === JUNE_TITLE, 'Lookup did not render exactly the upgraded dictionary source', { dictionaryCards, ...dom });
    assert(dom.definitions.includes('library (June)'), 'Lookup did not render the upgraded revision definitions', dom);

    const screenshot = path.join(ARTIFACTS, `local-dictionary-upgrade-${BROWSER_NAME}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await context.close();
    return { gmValues, preferences, dom, screenshot };
}

async function importDictionary(page, title, gloss) {
    const importButton = page.locator('.jpdb-reader-settings [data-action="import-yomitan-dictionary"]');
    await importButton.scrollIntoViewIfNeeded();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await importButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: `${title}.zip`,
        mimeType: 'application/zip',
        buffer: yomitanZipBuffer({
            'index.json': { title, format: 3, revision: 'smoke-1' },
            'term_bank_1.json': [
                ['図書館', 'としょかん', '', '', 10, [gloss], 1, ''],
                ['漢字', 'かんじ', '', '', 10, ['kanji'], 2, ''],
            ],
        }),
    });
    // The durable postcondition: the import merged a preference row for this
    // title into the installed Reader's saved settings.
    await page.waitForFunction(({ storageKey, expected }) => {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw == null ? null : JSON.parse(raw);
        return Boolean(parsed?.dictionaryPreferences?.some(row => row.name === expected));
    }, { storageKey: `${GM_STORAGE_PREFIX}${YOMU_SETTINGS_KEY}`, expected: title }, { timeout: 30_000 });
}

async function readGmValues(page) {
    return page.evaluate(prefix => Object.fromEntries(Object.keys(localStorage)
        .filter(key => key.startsWith(prefix))
        .map(key => [key.slice(prefix.length), localStorage.getItem(key)])), GM_STORAGE_PREFIX);
}

// Phase 2 — dictionaries stay where they were imported: GM values (settings +
// archive cache) are shared across origins, but the imported store must NOT be
// rebuilt on another origin. Open an ordinary page with only those GM values
// and assert that no dictionary copy appears there: annotations come from the
// fallback segmenter and the popover renders without a local-dictionary source.
async function verifyOrdinarySiteHasNoCopy(gmValues) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    const page = await context.newPage();
    attachDebugLogging(page, 'ordinary');
    await page.exposeFunction(REQUEST_BRIDGE_NAME, () => ({ status: 503, responseText: '' }));
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    // One program, in order: the shared GM values first, then the bridge that
    // serves them, then the Reader.
    await page.evaluate(({ prefix, values }) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(`${prefix}${key}`, value);
    }, { prefix: GM_STORAGE_PREFIX, values: gmValues });
    await installGmStorageBridgeOnCurrentPage(page, gmBridgeOptions);
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 8000 });

    // Let the page annotate and idle work run, then assert the origin never
    // gained a store the dictionary could have been rebuilt into.
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 30_000, polling: 250 });
    await page.waitForTimeout(5_000);
    const store = await readDictionaryStore(page, yomitanDatabaseName());
    assert(store.dictionaries.length === 0, 'A dictionary copy appeared on an origin it was never imported on', store);
    const lookupWord = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: LOOKUP_WORD }).first();
    await lookupWord.click();
    const popover = page.locator('.jpdb-reader-popover').last();
    await popover.waitFor({ state: 'visible', timeout: 15_000 });
    await assertPopoverHeadwordMatchesLookup(page, lookupWord, { label: 'ordinary-site popover' });
    await page.waitForTimeout(2_000);
    const dom = await popover.evaluate(node => {
        const clean = value => (value ?? '').replace(/\s+/g, ' ').trim();
        return {
            dictionaries: [...node.querySelectorAll('[data-source="local-dictionary"]')].map(card => card.getAttribute('data-dictionary') ?? ''),
            text: clean(node.textContent ?? '').slice(0, 400),
        };
    });
    assert(dom.dictionaries.length === 0, 'Ordinary-site popover rendered a local dictionary source that cannot exist there', dom);
    const screenshot = path.join(ARTIFACTS, `local-dictionary-crossorigin-${BROWSER_NAME}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await context.close();
    return { origin: server.origin, store, dom, screenshot };
}

// The rendered word no longer exposes its card source off-site (1.9.1 privacy
// hardening), so ask the origin's storage directly.
async function readDictionaryStore(page, dbName) {
    return page.evaluate(async name => {
        const listed = (await indexedDB.databases()).some(database => database.name === name);
        if (!listed) return { database: false, dictionaries: [] };
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            if (!database.objectStoreNames.contains('dictionaryInfo')) return { database: true, dictionaries: [] };
            const titles = await new Promise((resolve, reject) => {
                const request = database.transaction('dictionaryInfo', 'readonly').objectStore('dictionaryInfo').getAllKeys();
                request.onsuccess = () => resolve(request.result.map(String));
                request.onerror = () => reject(request.error);
            });
            return { database: true, dictionaries: titles };
        } finally {
            database.close();
        }
    }, dbName);
}

async function fulfillStudyAsset(route) {
    const filePath = studyAssetPath(new URL(route.request().url()).pathname);
    if (!filePath) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    return route.fulfill({ status: 200, contentType: contentTypeFor(filePath), body: readFileSync(filePath) });
}

function studyAssetPath(pathname) {
    if (pathname === '/study/' || pathname === '/study/index.html') return path.join(NEWTAB_DIR, 'index.html');
    const [base, relative] = pathname.startsWith('/study/')
        ? [NEWTAB_DIR, pathname.slice('/study/'.length)]
        : [DIST, pathname.slice(1)];
    const candidate = path.resolve(base, relative);
    if (!candidate.startsWith(`${path.resolve(base)}${path.sep}`)) return null;
    return existsSync(candidate) ? candidate : null;
}

function contentTypeFor(filePath) {
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    return types[path.extname(filePath)] ?? 'application/octet-stream';
}

function attachDebugLogging(page, label) {
    if (!process.env.SMOKE_DEBUG) return;
    page.on('console', message => console.error(`[${label}:console]`, message.type(), message.text().slice(0, 300)));
    page.on('pageerror', error => console.error(`[${label}:pageerror]`, error.message.slice(0, 300)));
}
