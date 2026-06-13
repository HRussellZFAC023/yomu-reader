#!/usr/bin/env node
// Regression smoke: in keyless mode (no jpdb/jiten API key), clicking a rendered
// kana-only word (e.g. タップ in 〜をタップし、) must open the lookup popover.
// Guards against the kana-fragment suppression swallowing exact-match words.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/keyless-popover.html';
const SENTENCE = 'どこでも単語をタップし、文脈で理解し、復習用に保存して、そのまま読み続けられます。';
const NATIVE_SENTENCE_TITLE = `${SENTENCE} / Native title fallback`;
const UNRELATED_NATIVE_TITLE = 'Unrelated native title';

const keylessSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    showPitchAccent: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>keyless popover smoke</title></head>
<body><main><p data-smoke-sentence title="${NATIVE_SENTENCE_TITLE}">${SENTENCE}</p><p data-unrelated-title title="${UNRELATED_NATIVE_TITLE}"> unrelated </p></main></body></html>`);
}, 'Could not bind keyless popover smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    // Keyless mode must work fully offline: every external request fails fast.
    const externalRequests = [];
    await page.exposeFunction('__yomuKeylessSmokeRequest', request => {
        externalRequests.push(request.url);
        // Hang public expansion lookups: the popover must not wait on them.
        if (request.url.includes('jpdb.io/search')) return new Promise(() => undefined);
        return { status: 503, responseText: '' };
    });
    await page.route(/https?:\/\/(?:[^/]*jpdb\.io|[^/]*workers\.dev)\//, route => {
        externalRequests.push(route.request().url());
        return route.abort();
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: keylessSettings,
        requestBridgeName: '__yomuKeylessSmokeRequest',
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });

    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 3, null, { timeout: 15_000 });
    const word = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: 'タップ' }).first();
    assert(await word.count() === 1, 'Keyless parse did not render a タップ reader word');
    const clickedAt = Date.now();
    await word.click();
    await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 8_000 });
    const popoverLatencyMs = Date.now() - clickedAt;
    const popoverText = (await page.locator('.jpdb-reader-popover').innerText()).trim();
    assert(popoverText.includes('タップ'), 'Popover opened but does not show the clicked word', { popoverText });
    assert(popoverLatencyMs < 3_000, 'Popover waited on a hung public expansion lookup', { popoverLatencyMs });
    const suppressedTitles = await page.evaluate(() => ({
        sentenceHasTitle: document.querySelector('[data-smoke-sentence]')?.hasAttribute('title') ?? true,
        sentenceStoredTitle: document.querySelector('[data-smoke-sentence]')?.getAttribute('data-jpdb-reader-native-title') ?? '',
        unrelatedTitle: document.querySelector('[data-unrelated-title]')?.getAttribute('title') ?? '',
    }));
    assert(!suppressedTitles.sentenceHasTitle, 'Active sentence native title was not suppressed while the popover was open', suppressedTitles);
    assert(suppressedTitles.sentenceStoredTitle === NATIVE_SENTENCE_TITLE, 'Suppressed native title was not preserved for restore', suppressedTitles);
    assert(suppressedTitles.unrelatedTitle === UNRELATED_NATIVE_TITLE, 'Unrelated native title was suppressed', suppressedTitles);

    await page.screenshot({ path: path.join(ARTIFACTS, 'keyless-word-popover-smoke.png'), fullPage: false });

    // Adjacent coverage: a kanji word must keep working through the same click path.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 3_000 });
    const restoredTitle = await page.locator('[data-smoke-sentence]').getAttribute('title');
    assert(restoredTitle === NATIVE_SENTENCE_TITLE, 'Active sentence native title was not restored after the popover closed', { restoredTitle });
    const kanjiWord = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: '単語' }).first();
    assert(await kanjiWord.count() === 1, 'Keyless parse did not render a 単語 reader word');
    await kanjiWord.click();
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-popover')?.textContent?.includes('単語'), null, { timeout: 8_000 });

    const report = { ok: true, clickedWords: ['タップ', '単語'], popoverShown: true, popoverLatencyMs, popoverPreview: popoverText.slice(0, 120), blockedExternalRequests: externalRequests };
    writeFileSync(path.join(ARTIFACTS, 'keyless-word-popover-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}
