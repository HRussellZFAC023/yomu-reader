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
//
// The same run then proves the learner's dictionary order (GitHub #43; see
// lib/dictionary-order-proof.mjs): it decides the popup's sections and which
// dictionary answers a word, and survives a reload, a second tab, an untouched
// Save and a later import.
// Runs in Firefox by default (the report came from Firefox);
// YOMU_SMOKE_BROWSER=chromium switches engines.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';
import {
    attachSmokeDebugLogging as attachDebugLogging,
    fulfillHostedStudyAsset,
    HOSTED_STUDY_ORIGIN as STUDY_ORIGIN,
    HOSTED_STUDY_URL as STUDY_URL,
    importYomitanDictionaryThroughSettings,
    readDictionaryStoreTitles as readDictionaryStore,
    readPrefixedGmValues,
    writePrefixedGmValues,
} from './lib/hosted-study-harness.mjs';
import { proveDictionaryOrder } from './lib/dictionary-order-proof.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
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
    const dictionaryOrder = await proveDictionaryOrder(browser);
    const report = { ok: true, browser: BROWSER_NAME, preferences: study.preferences, dom: study.dom, screenshot: study.screenshot, offSite, dictionaryOrder };
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
    await context.route(`${STUDY_ORIGIN}/**`, route => fulfillHostedStudyAsset(route));
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

    const gmValues = await readPrefixedGmValues(page, GM_STORAGE_PREFIX);
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
    const upgradedDefinitions = upgradedCard.getByText('library (June)', { exact: true });
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

function importDictionary(page, title, gloss) {
    return importYomitanDictionaryThroughSettings(page, {
        title,
        gmStoragePrefix: GM_STORAGE_PREFIX,
        terms: [
            ['図書館', 'としょかん', '', '', 10, [gloss], 1, ''],
            ['漢字', 'かんじ', '', '', 10, ['kanji'], 2, ''],
        ],
    });
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
    await writePrefixedGmValues(page, GM_STORAGE_PREFIX, gmValues);
    await installGmStorageBridgeOnCurrentPage(page, gmBridgeOptions);
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 8000 });

    // Let the page annotate and idle work run, then assert the origin never
    // gained a store the dictionary could have been rebuilt into.
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 30_000, polling: 250 });
    await page.waitForTimeout(5_000);
    // The rendered word no longer exposes its card source off-site (1.9.1
    // privacy hardening), so ask the origin's storage directly.
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
