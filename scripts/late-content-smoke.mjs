#!/usr/bin/env node
// Repro for "sites missing ruby entirely" (Google Maps / claude.ai class):
// Japanese text that streams in AFTER load, inside a nested scroll container,
// must still get parsed (ruby + reader words) by the auto-scan observer.
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);

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

const settings = {
    onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', jitenApiKey: '',
    ankiEnabled: false, audioEnabled: false, enableLogging: false,
};

const server = await startLoopbackServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
}, 'Could not bind late-content smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const page = await browser.newPage();
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
    await page.goto(`${server.origin}/late-content`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });
    // Wait beyond both injections + scan debounce.
    await page.waitForTimeout(9000);
    const state = await page.evaluate(() => ({
        messages: document.querySelectorAll('.message').length,
        readerWords: document.querySelectorAll('.message .jpdb-reader-word').length,
        ruby: document.querySelectorAll('.message rt').length,
    }));
    console.log(JSON.stringify(state));
    if (!state.readerWords) {
        console.error('FAIL: late-streamed Japanese was never parsed (missing-ruby repro confirmed)');
        process.exit(1);
    }
    console.log('late-content smoke passed');
} finally {
    await browser.close();
    await closeServer(server.server);
}
