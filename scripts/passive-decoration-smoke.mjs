#!/usr/bin/env node
// Passive-word decoration regression smoke: link-wrapped prose and headline
// links must keep their pitch underline and furigana AT REST (no hover), while
// chrome contexts (nav chips, buttons) stay bare until hover. Guards against
// the 1.5.4 regression where every passive word lost its underline until
// hovered, making pitch accents flicker on link-heavy sites.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const REQUEST_BRIDGE = '__yomuPassiveDecorationRequest';
const PAGE_PATH = '/passive-decoration.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);

const VOCABULARY = [
    ['選挙', '選挙', 'せんきょ', 'election', ['noun'], 100, ['known'], ['LHHH']],
    ['政府', '政府', 'せいふ', 'government', ['noun'], 100, ['known'], ['LHH']],
    ['減税', '減税', 'げんぜい', 'tax cut', ['noun'], 100, ['known'], ['LHHH']],
    ['検討', '検討', 'けんとう', 'consideration', ['noun'], 100, ['known'], ['LHHH']],
    ['経済', '経済', 'けいざい', 'economy', ['noun'], 100, ['known'], ['LHHH']],
    ['首相', '首相', 'しゅしょう', 'prime minister', ['noun'], 100, ['known'], ['LHHH']],
    ['スポーツ', 'スポーツ', 'スポーツ', 'sports', ['noun'], 100, ['known'], ['LHHH']],
    ['注文', '注文', 'ちゅうもん', 'order', ['noun'], 100, ['known'], ['LHHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['noun'], 100, ['known'], ['LHHH']],
    ['発表', '発表', 'はっぴょう', 'announcement', ['noun'], 100, ['known'], ['LHHH']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'off',
    enableLogging: false,
};

const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passive Decoration Fixture</title>
<style>
html, body { margin: 0; min-height: 100%; background: #ffffff; color: #1c2733; font: 16px/1.7 system-ui, sans-serif; }
.shell { width: min(880px, 100vw); margin: 0 auto; padding: 18px; box-sizing: border-box; }
nav.menu { display: flex; gap: 10px; border-bottom: 1px solid #d8dee9; padding-bottom: 10px; }
nav.menu a { color: #2456a8; text-decoration: none; white-space: nowrap; }
.news { list-style: none; margin: 18px 0; padding: 0; }
.news li { margin: 8px 0; }
.news a { color: #17324f; text-decoration: none; }
article p { max-width: 60ch; }
article a { color: #2456a8; }
button.order { font: inherit; padding: 6px 14px; }
</style>
</head>
<body>
<div class="shell">
  <nav class="menu" aria-label="サイト">
    <a id="nav-election" href="/category/elections">選挙</a>
    <a id="nav-sports" href="/category/sports">スポーツ</a>
  </nav>
  <ul class="news">
    <li><a id="headline" href="/news/1">首相、減税の検討を発表</a></li>
  </ul>
  <article>
    <p id="prose">政府は<a id="prose-link" href="/wiki/tax">減税</a>を検討している。経済の発表もある。</p>
  </article>
  <button id="order-button" class="order" type="button">注文確認</button>
</div>
</body>
</html>`;

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
}, 'Could not bind passive decoration smoke server');

const requests = [];
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const context = await browser.newContext({ bypassCSP: true, locale: 'ja-JP', viewport: { width: 880, height: 680 } });
    const page = await context.newPage();
    page.on('pageerror', error => {
        throw error;
    });
    await page.exposeFunction(REQUEST_BRIDGE, request => mockedYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: REQUEST_BRIDGE,
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });

    await page.waitForFunction(() => {
        return document.querySelector('#prose-link .jpdb-reader-word')
            && document.querySelector('#headline .jpdb-reader-word')
            && document.querySelector('#nav-election .jpdb-reader-word')
            && document.querySelector('#order-button .jpdb-reader-word')
            && document.querySelector('#prose .jpdb-reader-word[data-pitch-class]');
    }, null, { timeout: 20_000 });

    const atRest = await page.evaluate(snapshotDecorations);
    assertContentDecorated(atRest, 'at rest');
    assert(isTransparentColor(atRest.navChip.underline), 'Nav chip link showed an underline at rest (chrome must stay bare)', atRest.navChip);
    assert(isTransparentColor(atRest.orderButton.underline), 'Button label showed an underline at rest (chrome must stay bare)', atRest.orderButton);
    assert(atRest.proseLink.hasFurigana, 'Prose link word lost its furigana', atRest.proseLink);
    assert(atRest.headline.hasFurigana, 'Headline link word lost its furigana', atRest.headline);

    // Hover the linked prose word, then move away: the underline must remain
    // identical before, during, and after hover (the reported bug was
    // hover-only flicker).
    await page.locator('#prose-link .jpdb-reader-word').first().hover();
    await page.waitForTimeout(120);
    const hovered = await page.evaluate(snapshotDecorations);
    assertContentDecorated(hovered, 'while hovered');

    await page.mouse.move(6, 6);
    await page.waitForTimeout(160);
    const afterHover = await page.evaluate(snapshotDecorations);
    assertContentDecorated(afterHover, 'after hover moved away');
    assert(afterHover.proseLink.underline === atRest.proseLink.underline,
        'Prose link underline changed after hover (flicker)', { atRest: atRest.proseLink, afterHover: afterHover.proseLink });

    await page.screenshot({ path: path.join(ARTIFACTS, 'passive-decoration-smoke.png'), fullPage: true });
    console.log(JSON.stringify({ atRest, afterHover, requests: requests.length }, null, 2));
    console.log('passive-decoration smoke passed');
} finally {
    await closeSmokeBrowserAndServer(browser, server);
}

function mockedYomuRequest(request, requestLog) {
    const url = new URL(request.url);
    if (url.origin !== JPDB_API_ORIGIN || !url.pathname.startsWith(JPDB_API_PREFIX)) {
        requestLog.push({ kind: 'unexpected', url: request.url });
        return { status: 404, responseText: '' };
    }
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readJsonBody(request.data);
    requestLog.push({ kind: 'jpdb', endpoint, text: body.text });
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    return jsonHttpResponse({});
}

function snapshotDecorations() {
    const describe = selector => {
        const word = document.querySelector(selector);
        if (!word) return null;
        const after = getComputedStyle(word, '::after');
        return {
            selector,
            classes: word.className,
            passive: word.classList.contains('jpdb-reader-passive-word'),
            pitchClass: word.dataset.pitchClass ?? '',
            underline: after.borderBottomColor,
            hasFurigana: Boolean(word.querySelector('rt')),
        };
    };
    return {
        proseLink: describe('#prose-link .jpdb-reader-word'),
        prosePlain: describe('#prose > .jpdb-reader-word[data-pitch-class]') ?? describe('#prose .jpdb-reader-word:not(#prose-link *)'),
        headline: describe('#headline .jpdb-reader-word'),
        navChip: describe('#nav-election .jpdb-reader-word'),
        orderButton: describe('#order-button .jpdb-reader-word'),
    };
}

function assertContentDecorated(snapshot, phase) {
    for (const key of ['proseLink', 'headline']) {
        const word = snapshot[key];
        assert(word, `Missing annotated word for ${key} (${phase})`, snapshot);
        assert(word.passive, `${key} was expected to be a passive word (${phase})`, word);
        assert(!isTransparentColor(word.underline), `${key} lost its pitch underline (${phase})`, word);
    }
}

function isTransparentColor(value) {
    if (!value) return true;
    const normalized = String(value).replace(/\s+/g, '');
    return normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
}
