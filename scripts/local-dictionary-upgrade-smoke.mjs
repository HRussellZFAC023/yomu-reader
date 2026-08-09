#!/usr/bin/env node
// Regression smoke: importing a newer revision of an installed dictionary
// ("Jitendex.org [2026-06-06]" over "[2026-05-05]") must behave as an
// upgrade — one settings row carrying the old row's rank, and a popover
// source card for the new revision. Before 1.6.232 the old row lingered as
// an enabled source that could never render (user-reported: settings listed
// six sources, the popover showed none of them).
// Runs in Firefox by default (the report came from Firefox);
// YOMU_SMOKE_BROWSER=chromium switches engines.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    addGmStorageBridgeInitScript,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';
import { yomitanZipBuffer } from './lib/yomitan-zip.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(ROOT, 'dist', 'greasyfork', 'yomu-settings-surface.user.js');
const UI_COPY_COMPANION_PATH = path.join(ROOT, 'dist', 'greasyfork', 'yomu-ui-copy.user.js');
const PAGE_PATH = '/local-dictionary-upgrade.html';
const SENTENCE = '図書館で漢字を調べています。';
const MAY_TITLE = 'Jitendex.org [2026-05-05]';
const JUNE_TITLE = 'Jitendex.org [2026-06-06]';
const BROWSER_NAME = process.env.YOMU_SMOKE_BROWSER === 'chromium' ? 'chromium' : 'firefox';

const settings = {
    onboardingSeen: true,
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

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, SETTINGS_COMPANION_PATH, UI_COPY_COMPANION_PATH], ROOT, 'Run npm run build first.');

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
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[console]', message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 300)));
    }
    await page.exposeFunction('__yomuLocalDictionaryUpgradeRequest', () => ({ status: 503, responseText: '' }));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuLocalDictionaryUpgradeRequest',
    });

    const inject = async () => {
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, UI_COPY_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SETTINGS_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 8000 });
    };

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await page.waitForFunction(() => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent('yomu-open-settings', { detail: { panel: 'backup' } }));
        return false;
    }, null, { timeout: 30_000, polling: 500 });

    const importDictionary = async (title, gloss) => {
        const importButton = page.locator('[data-action="import-yomitan-dictionary"]');
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
        // The durable postcondition: the import merged a preference row for
        // this title into saved settings.
        await page.waitForFunction(({ settingsKey, expected }) => {
            const raw = localStorage.getItem(settingsKey);
            const parsed = raw == null ? null : JSON.parse(raw);
            return Boolean(parsed?.dictionaryPreferences?.some(row => row.name === expected));
        }, { settingsKey: YOMU_SETTINGS_KEY, expected: title }, { timeout: 30_000 });
    };

    // Give the May row a custom rank so the upgrade has something to inherit.
    await importDictionary(MAY_TITLE, 'library (May)');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));
    await importDictionary(JUNE_TITLE, 'library (June)');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));

    const savedPreferences = await page.evaluate(key => {
        const raw = localStorage.getItem(key);
        const parsed = raw == null ? null : JSON.parse(raw);
        return parsed?.dictionaryPreferences ?? [];
    }, YOMU_SETTINGS_KEY);
    const jitendexRows = savedPreferences.filter(row => /^Jitendex\.org /.test(row.name));
    assert(jitendexRows.length === 1, 'Revision upgrade left more than one Jitendex settings row', savedPreferences);
    assert(jitendexRows[0].name === JUNE_TITLE, 'Settings row does not point at the imported revision', jitendexRows);

    // Capture the GM values (settings + archive cache) BEFORE the reload:
    // the fixture bridge re-seeds base settings on every navigation, which
    // would wipe the imported dictionary preferences from the dump.
    const gmDump = await page.evaluate(() => {
        const entries = {};
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key) entries[key] = localStorage.getItem(key);
        }
        return entries;
    });

    // Fresh load: the popover must render the upgraded dictionary as a source.
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 30_000 });
    const lookupWord = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: '図書館' }).first();
    await lookupWord.click();
    const popover = page.locator('.jpdb-reader-popover').last();
    await popover.waitFor({ state: 'visible', timeout: 15_000 });
    await assertPopoverHeadwordMatchesLookup(page, lookupWord, { label: 'local-dictionary popover' });
    // Provider/grammar sections can precede this card, so a prefix of the
    // whole popover is not evidence that the upgraded definition is absent.
    const upgradedCard = popover.locator(`[data-source="local-dictionary"][data-dictionary="${JUNE_TITLE}"]`);
    await upgradedCard.waitFor({ state: 'attached', timeout: 15_000 });
    const upgradedDefinitions = upgradedCard.locator('[data-definition-translation-text]', { hasText: 'library (June)' });
    await upgradedDefinitions.waitFor({ state: 'attached', timeout: 15_000 });

    const dom = {
        dictionary: await upgradedCard.getAttribute('data-dictionary'),
        title: (await upgradedCard.locator('summary').innerText()).replace(/\s+/g, ' ').trim(),
        definitions: (await upgradedDefinitions.innerText()).replace(/\s+/g, ' ').trim(),
    };
    const dictionaryCards = await popover.locator('[data-source="local-dictionary"]').count();
    assert(dictionaryCards === 1 && dom.dictionary === JUNE_TITLE, 'Popover did not render exactly the upgraded dictionary source', { dictionaryCards, ...dom });
    assert(dom.definitions.includes('library (June)'), 'Popover did not render the upgraded revision definitions', dom);

    const screenshotPath = path.join(ARTIFACTS, `local-dictionary-upgrade-${BROWSER_NAME}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Phase 2 — dictionaries stay where they were imported: GM values
    // (settings + archive cache) are shared across origins, but the imported
    // store must NOT be rebuilt on another origin. Visit the same server
    // under a DIFFERENT origin (localhost vs 127.0.0.1), seed only the GM
    // values, and assert that no dictionary copy appears there: annotations
    // come from the fallback segmenter and the popover renders without a
    // local-dictionary source.
    await context.close();

    const archiveIndex = gmDump['yomu-dictionary-archives'] ? JSON.parse(gmDump['yomu-dictionary-archives']) : null;
    assert(archiveIndex && archiveIndex['jitendex.org'], 'Import did not persist a cross-origin dictionary archive', Object.keys(gmDump));

    const crossOrigin = server.origin.replace('127.0.0.1', 'localhost');
    if (crossOrigin === server.origin) throw new Error(`Could not derive a second origin from ${server.origin}`);
    const crossContext = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    const crossPage = await crossContext.newPage();
    if (process.env.SMOKE_DEBUG) {
        crossPage.on('console', message => console.error('[cross:console]', message.type(), message.text().slice(0, 300)));
        crossPage.on('pageerror', error => console.error('[cross:pageerror]', error.message.slice(0, 300)));
    }
    await crossPage.exposeFunction('__yomuLocalDictionaryUpgradeRequest', () => ({ status: 503, responseText: '' }));
    await crossPage.addInitScript(entries => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, gmDump);
    await addGmStorageBridgeInitScript(crossPage, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuLocalDictionaryUpgradeRequest',
        initialize: 'ifMissing',
    });
    await crossPage.goto(`${crossOrigin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(crossPage, CSS_PATH);
    await addScriptTagWithCspFallback(crossPage, UI_COPY_COMPANION_PATH);
    await addScriptTagWithCspFallback(crossPage, SETTINGS_COMPANION_PATH);
    await addScriptTagWithCspFallback(crossPage, SCRIPT_PATH);
    await crossPage.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 8000 });

    // Let the page annotate and idle work run, then assert no word was ever
    // fed by a local store on this origin.
    await crossPage.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 30_000, polling: 250 });
    await crossPage.waitForTimeout(5_000);
    const crossLocalWords = await crossPage.evaluate(() => [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
        .filter(word => word.getAttribute('data-card-source') === 'local').length);
    assert(crossLocalWords === 0, 'A dictionary copy appeared on an origin it was never imported on', { crossLocalWords });
    const crossLookupWord = crossPage.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: '図書館' }).first();
    await crossLookupWord.click();
    const crossPopover = crossPage.locator('.jpdb-reader-popover').last();
    await crossPopover.waitFor({ state: 'visible', timeout: 15_000 });
    await assertPopoverHeadwordMatchesLookup(crossPage, crossLookupWord, { label: 'cross-origin popover' });
    await crossPage.waitForTimeout(2_000);
    const crossDom = await crossPopover.evaluate(node => {
        const clean = value => (value ?? '').replace(/\s+/g, ' ').trim();
        return {
            dictionaries: [...node.querySelectorAll('[data-source="local-dictionary"]')].map(card => card.getAttribute('data-dictionary') ?? ''),
            text: clean(node.textContent ?? '').slice(0, 400),
        };
    });
    assert(crossDom.dictionaries.length === 0, 'Cross-origin popover rendered a local dictionary source that cannot exist there', crossDom);
    const crossScreenshotPath = path.join(ARTIFACTS, `local-dictionary-crossorigin-${BROWSER_NAME}.png`);
    await crossPage.screenshot({ path: crossScreenshotPath, fullPage: true });
    await crossContext.close();

    const report = { ok: true, browser: BROWSER_NAME, preferences: savedPreferences, dom, crossOrigin: { origin: crossOrigin, dom: crossDom, screenshot: crossScreenshotPath }, screenshot: screenshotPath };
    writeFileSync(path.join(ARTIFACTS, `local-dictionary-upgrade-${BROWSER_NAME}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('local-dictionary-upgrade smoke passed');
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}
