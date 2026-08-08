#!/usr/bin/env node
// Repro for "sites missing ruby entirely" (Google Maps / claude.ai class):
// Japanese text that streams in AFTER load, inside a nested scroll container,
// must still get parsed into reader words and readings by the auto-scan observer.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
    assertBuiltArtifacts,
    closeServer,
    createReaderSmokeSettings,
    createSmokePaths,
    installUserscriptFixtureBridge,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...userscriptCompanionPaths(SCRIPT_PATH)], ROOT);
const REQUEST_BRIDGE = '__yomuLateContentRequest';
const VOCABULARY = [
    ['今日', '今日', 'きょう', 'today', ['noun'], 100, ['known'], ['LH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adjective'], 200, ['known'], ['LHHHH']],
    ['単語', '単語', 'たんご', 'word', ['noun'], 300, ['known'], ['LHH']],
    ['勉強', '勉強', 'べんきょう', 'study', ['noun'], 400, ['known'], ['LHHH']],
    ['地図', '地図', 'ちず', 'map', ['noun'], 500, ['known'], ['LH']],
    ['東京駅', '東京駅', 'とうきょうえき', 'Tokyo Station', ['noun'], 600, ['known'], ['LHHHHH']],
    ['探して', '探す', 'さがして', 'look for', ['verb'], 700, ['known'], ['LHHH']],
];

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>App</title></head>
<body><div id="app" style="height:100vh;overflow:hidden">
<main style="height:100%;overflow:auto"><div id="chat"></div></main></div>
<script>
setTimeout(() => {
    const row = document.createElement('div');
    row.className = 'message';
    row.textContent = '今日は新しい単語を勉強します。';
    document.getElementById('chat').appendChild(row);
}, 2500);
setTimeout(() => {
    const row = document.createElement('div');
    row.className = 'message';
    row.textContent = '地図で東京駅を探してください。';
    document.getElementById('chat').appendChild(row);
}, 4000);
</script></body></html>`;

const settings = createReaderSmokeSettings({
    parserProvider: 'jpdb',
    jitenDefinitionsEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showPitchAccent: false,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'off',
    wordTextColorSource: 'off',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
});

const server = await startLoopbackServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
}, 'Could not bind late-content smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const page = await browser.newPage();
    const requests = [];
    page.on('console', message => {
        if (process.env.SMOKE_DEBUG) console.error('[late-content]', message.type(), message.text());
    });
    page.on('pageerror', error => {
        if (process.env.SMOKE_DEBUG) console.error('[late-content:pageerror]', error);
    });
    await installUserscriptFixtureBridge(page, {
        requestBridgeName: REQUEST_BRIDGE,
        requestHandler: request => handleYomuRequest(request, requests),
        settings,
        css: readFileSync(CSS_PATH, 'utf8'),
    });
    await page.goto(`${server.origin}/late-content`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    // Wait beyond both injections + scan debounce.
    await page.waitForTimeout(9000);
    const state = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.message')].map(message => ({
            text: message.textContent ?? '',
            readerWords: message.querySelectorAll('.jpdb-reader-word').length,
            ruby: message.querySelectorAll('rt').length,
        }));
        return {
            messages: rows.length,
            readerWords: rows.reduce((total, row) => total + row.readerWords, 0),
            ruby: rows.reduce((total, row) => total + row.ruby, 0),
            rows,
        };
    });
    const report = {
        ...state,
        parseRequests: requests.filter(request => request.endpoint === 'parse').length,
        auxiliaryRequests: requests.filter(request => request.endpoint === 'auxiliary').length,
    };
    console.log(JSON.stringify(report));
    if (report.rows.length !== 2
        || report.rows.some(row => !row.readerWords || !row.ruby)
        || !report.parseRequests) {
        console.error('FAIL: late-streamed Japanese was never parsed (missing-ruby repro confirmed)');
        process.exit(1);
    }
    console.log('late-content smoke passed');
} finally {
    await browser.close();
    await closeServer(server.server);
}

function handleYomuRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requests.push({ endpoint: 'parse', text: body.text });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    }
    requests.push({ endpoint: 'auxiliary', url: request.url });
    if (process.env.SMOKE_DEBUG) console.error('[late-content:auxiliary]', request.url);
    return { status: 404, responseText: '' };
}
