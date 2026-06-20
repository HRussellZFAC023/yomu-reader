#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/popover-headword-furigana.html';
const LOOKUP_WORD = '大変';
const VOCABULARY = [
    [LOOKUP_WORD, LOOKUP_WORD, 'たいへん', 'difficult; serious', ['adj-na'], 1500, ['not-in-deck'], ['LHHH']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: false,
    jpdbMiningEnabled: false,
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    jpdbKanjiEnabled: false,
    kanjivgEnabled: false,
    kanjiOriginsEnabled: false,
    rtkEnabled: false,
    uchisenEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    lookupOnHover: true,
    lookupOnClick: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 300,
    popupActivationMode: 'hover',
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
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>popover headword furigana</title></head>
<body><main><p data-smoke-sentence style="font: 28px/1.8 system-ui; margin: 80px;">今日は大変な日です。</p></main></body></html>`);
}, 'Could not bind popover headword furigana smoke server');

const requests = [];
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    await page.exposeFunction('__yomuHeadwordFuriganaRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuHeadwordFuriganaRequest',
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });
    await page.waitForFunction(
        value => document.querySelectorAll(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${value}"]`).length >= 1,
        LOOKUP_WORD,
        { timeout: 15_000 },
    );

    const word = page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${LOOKUP_WORD}"]`).first();
    await word.hover();
    const headword = await waitForHeadwordFurigana(page);
    assert(headword.metaReading === '', 'Popup still showed duplicate reading metadata beside ruby headword', headword);

    await page.locator('.jpdb-reader-popover .jpdb-reader-spelling .jpdb-reader-kanji-inline[data-kanji="変"]').click();
    await page.waitForFunction(
        () => document.querySelector('.jpdb-reader-popover .jpdb-reader-kanji-display')?.textContent?.trim() === '変',
        null,
        { timeout: 8_000 },
    );
    const kanji = await page.evaluate(() => ({
        display: document.querySelector('.jpdb-reader-popover .jpdb-reader-kanji-display')?.textContent?.trim() ?? '',
        title: document.querySelector('.jpdb-reader-popover .jpdb-reader-title-row')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    assert(kanji.display === '変', 'Clicking a ruby-wrapped kanji button did not open kanji details', { headword, kanji });

    const screenshot = path.join(ARTIFACTS, 'popover-headword-furigana.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    const report = { ok: true, headword, kanji, requests, screenshot };
    writeFileSync(path.join(ARTIFACTS, 'popover-headword-furigana-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

async function waitForHeadwordFurigana(page) {
    const handle = await page.waitForFunction(() => {
        const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling');
        if (!spelling) return null;
        const furi = [...spelling.querySelectorAll('rt.jpdb-reader-furi')].map(rt => rt.textContent?.trim() ?? '');
        const buttons = [...spelling.querySelectorAll('.jpdb-reader-kanji-inline')].map(button => ({
            text: button.textContent?.trim() ?? '',
            kanji: button.getAttribute('data-kanji') ?? '',
            action: button.getAttribute('data-action') ?? '',
            insideRuby: Boolean(button.closest('ruby')),
        }));
        if (furi.join('|') !== 'たい|へん') return null;
        if (buttons.map(button => button.kanji).join('') !== '大変') return null;
        if (buttons.some(button => button.action !== 'kanji' || !button.insideRuby)) return null;
        return {
            text: spelling.textContent?.replace(/\s+/g, '').trim() ?? '',
            html: spelling.innerHTML,
            furi,
            buttons,
            metaReading: document.querySelector('.jpdb-reader-popover .jpdb-reader-meta-reading')?.textContent?.trim() ?? '',
        };
    }, null, { timeout: 15_000 });
    return await handle.jsonValue();
}

function handleYomuRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requestsLog.push({ kind: 'jpdb-parse', text: body.text });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY, {
            tokenReading: () => [['大', 'たい'], ['変', 'へん']],
        }));
    }
    requestsLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}
