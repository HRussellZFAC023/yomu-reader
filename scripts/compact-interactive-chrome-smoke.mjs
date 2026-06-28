#!/usr/bin/env node
// Generic compact-control regression smoke: furigana and hover highlights must
// not grow or crowd short app chrome labels, while prose links still get ruby.
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
const REQUEST_BRIDGE = '__yomuCompactChromeRequest';
const PAGE_PATH = '/compact-interactive-chrome.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);

const VOCABULARY = [
    ['選挙', '選挙', 'せんきょ', 'election', ['noun'], 100, ['known'], ['LHHH']],
    ['注文', '注文', 'ちゅうもん', 'order', ['noun'], 100, ['known'], ['LHHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['noun'], 100, ['known'], ['LHHH']],
    ['取引', '取引', 'とりひき', 'trade', ['noun'], 100, ['known'], ['LHHH']],
    ['詳細', '詳細', 'しょうさい', 'details', ['noun'], 100, ['known'], ['LHHH']],
    ['スポーツ', 'スポーツ', 'スポーツ', 'sports', ['noun'], 100, ['known'], ['LHHH']],
    ['アカウント', 'アカウント', 'アカウント', 'account', ['noun'], 100, ['known'], ['LHHH']],
    ['選択', '選択', 'せんたく', 'selection', ['noun'], 100, ['known'], ['LHHH']],
    ['詳しく', '詳しく', 'くわしく', 'in detail', ['adverb'], 100, ['known'], ['LHHH']],
    ['読む', '読む', 'よむ', 'read', ['verb'], 100, ['known'], ['LH']],
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
    wordHighlightColorSource: 'jpdb',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'off',
    enableLogging: false,
};

const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Compact Interactive Chrome Fixture</title>
<style>
html, body { margin: 0; min-height: 100%; background: #080b10; color: #e9edf4; font: 16px/1.35 system-ui, sans-serif; }
body { display: grid; place-items: start center; }
.shell { width: min(920px, 100vw); padding: 18px; box-sizing: border-box; }
.topbar { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #222a35; padding-bottom: 12px; }
.brand { font-weight: 700; letter-spacing: .02em; color: #f7fafc; }
.categories { display: flex; align-items: center; gap: 8px; min-width: 0; }
.chip, .trade-button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: 32px; max-height: 32px; padding: 0 12px; border: 1px solid #2d3748; border-radius: 999px; color: #f8fafc; background: #161b23; line-height: 20px; white-space: nowrap; overflow: hidden; text-decoration: none; }
.chip { min-width: 58px; }
.chip[data-neighbor] { color: #d8dee9; background: #10151d; }
.market-card { margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; border: 1px solid #222a35; border-radius: 8px; padding: 14px; background: #0f141c; }
.market-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #eef2f7; }
.trade-button { width: 96px; border-radius: 8px; font: inherit; cursor: pointer; }
.trade-button[data-neighbor] { width: 88px; background: #121923; }
.account-choice { margin-top: 18px; width: 320px; height: 42px; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; background: #10151d; border: 1px solid #263241; color: #f8fafc; text-decoration: none; }
.composer { margin-top: 18px; border: 1px solid #263241; border-radius: 8px; padding: 10px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; background: #10151d; }
.composer [contenteditable] { min-height: 26px; color: #f8fafc; }
.composer [data-placeholder] { color: #8b98aa; }
.composer input, .composer textarea { min-width: 0; border: 1px solid #334155; background: #0b1119; color: #f8fafc; border-radius: 6px; padding: 6px 8px; }
.composer textarea { resize: none; height: 32px; }
.composer button { border: 1px solid #334155; background: #182131; color: #f8fafc; border-radius: 6px; padding: 0 12px; }
.prose { margin-top: 26px; max-width: 58ch; color: #d8dee9; line-height: 1.7; }
.prose a { color: #8ab4f8; }
</style>
</head>
<body>
<main class="shell">
  <header class="topbar">
    <div class="brand">Market</div>
    <nav class="categories" aria-label="Categories">
      <a id="category-election" data-compact-control class="chip" href="/category/elections">選挙</a>
      <a id="category-sports" data-neighbor class="chip" href="/category/sports">スポーツ</a>
    </nav>
  </header>
  <section class="market-card">
    <div class="market-title">日本の選挙市場</div>
    <button id="trade-confirm" data-compact-control class="trade-button" type="button">注文確認</button>
    <button id="trade-details" data-neighbor class="trade-button" type="button">取引詳細</button>
  </section>
  <a id="account-choice" data-compact-control class="account-choice" href="/accounts">アカウントを選択</a>
  <section class="composer">
    <div id="composer-placeholder" class="ProseMirror" contenteditable="true" data-placeholder="メッセージを入力"></div>
    <button id="composer-send" type="button">送信</button>
    <input id="composer-input" type="search" placeholder="日本語を検索">
    <textarea id="composer-textarea" placeholder="質問する"></textarea>
  </section>
  <article class="prose">
    <p><a id="prose-link" data-prose href="/analysis/elections">選挙について詳しく読む</a></p>
  </article>
</main>
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
}, 'Could not bind compact interactive chrome smoke server');

const requests = [];
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const context = await browser.newContext({ bypassCSP: true, colorScheme: 'dark', locale: 'ja-JP', viewport: { width: 920, height: 620 } });
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
    const before = await page.evaluate(snapshotNativeControls);
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });

    await page.waitForFunction(() => {
        return document.querySelectorAll('[data-compact-control] .jpdb-reader-word').length >= 2
            && document.querySelector('#prose-link rt');
    }, null, { timeout: 20_000 });

    const beforeHover = await page.evaluate(snapshotCompactChromeFixture, before);
    assertCompactChromeSnapshot(beforeHover, 'before hover');
    await page.locator('#category-election .jpdb-reader-word').first().hover();
    await page.locator('#trade-confirm .jpdb-reader-word').first().hover();
    await page.waitForTimeout(120);
    const afterHover = await page.evaluate(snapshotCompactChromeFixture, before);
    assertCompactChromeSnapshot(afterHover, 'after hover');
    assert(afterHover.compactControls.every(control => isTransparentBackgroundPaint(control.hoverBackgroundImage)), 'Compact passive chrome drew a visible hover background', afterHover.compactControls);
    await page.screenshot({ path: path.join(ARTIFACTS, 'compact-interactive-chrome-smoke.png'), fullPage: true });
    console.log(JSON.stringify({ beforeHover, afterHover, requests: requests.length }, null, 2));
    console.log('compact-interactive-chrome smoke passed');
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
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [] });
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [] });
    return jsonHttpResponse({});
}

function snapshotNativeControls() {
    return Object.fromEntries([...document.querySelectorAll('[data-compact-control], [data-neighbor]')].map(element => {
        const rect = element.getBoundingClientRect();
        return [element.id, {
            height: rect.height,
            width: rect.width,
            scrollHeight: element.scrollHeight,
            scrollWidth: element.scrollWidth,
        }];
    }));
}

function snapshotCompactChromeFixture(native) {
    function controlSnapshot(element, nativeControl) {
        const rect = element.getBoundingClientRect();
        const words = [...element.querySelectorAll('.jpdb-reader-word')].map(word => {
            const wordRect = word.getBoundingClientRect();
            const style = getComputedStyle(word);
            return {
                text: word.textContent?.replace(/\s+/g, '').trim() ?? '',
                inside: wordRect.left >= rect.left - 1
                    && wordRect.right <= rect.right + 1
                    && wordRect.top >= rect.top - 1
                    && wordRect.bottom <= rect.bottom + 1,
                passive: word.getAttribute('data-jpdb-reader-passive') ?? '',
                rubyCount: word.querySelectorAll('rt,.jpdb-reader-furi').length,
                backgroundImage: style.backgroundImage,
            };
        });
        const hoverWord = element.querySelector('.jpdb-reader-word');
        return {
            id: element.id,
            text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
            passiveChrome: element.getAttribute('data-jpdb-reader-passive-chrome') ?? '',
            height: rect.height,
            width: rect.width,
            nativeHeight: nativeControl.height,
            nativeWidth: nativeControl.width,
            scrollHeight: element.scrollHeight,
            nativeScrollHeight: nativeControl.scrollHeight,
            wordCount: words.length,
            rubyCount: element.querySelectorAll('rt,.jpdb-reader-furi').length,
            words,
            hoverBackgroundImage: hoverWord ? getComputedStyle(hoverWord).backgroundImage : '',
        };
    }

    function neighborSnapshot(element) {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
            id: element.id,
            text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
            centerHitsNeighbor: Boolean(hit?.closest(`#${element.id}`)),
            rubyCount: element.querySelectorAll('rt,.jpdb-reader-furi').length,
        };
    }

    const compactControls = [...document.querySelectorAll('[data-compact-control]')].map(element => controlSnapshot(element, native[element.id]));
    const neighbors = [...document.querySelectorAll('[data-neighbor]')].map(element => neighborSnapshot(element));
    const prose = document.querySelector('#prose-link');
    return {
        compactControls,
        neighbors,
        prose: {
            text: prose?.textContent?.replace(/\s+/g, '').trim() ?? '',
            wordCount: prose?.querySelectorAll('.jpdb-reader-word').length ?? 0,
            rubyText: prose?.querySelector('rt')?.textContent?.trim() ?? '',
            passiveChrome: prose?.getAttribute('data-jpdb-reader-passive-chrome') ?? '',
        },
        composer: {
            placeholderWords: document.querySelectorAll('#composer-placeholder .jpdb-reader-word').length,
            inputMirror: document.querySelector('#composer-input + .jpdb-reader-control-text-mirror')?.textContent?.trim() ?? '',
            inputPlaceholderHidden: document.querySelector('#composer-input')?.getAttribute('data-jpdb-reader-control-placeholder-hidden') ?? '',
            textareaMirror: document.querySelector('#composer-textarea + .jpdb-reader-control-text-mirror')?.textContent?.trim() ?? '',
            textareaPlaceholderHidden: document.querySelector('#composer-textarea')?.getAttribute('data-jpdb-reader-control-placeholder-hidden') ?? '',
            sendWords: document.querySelectorAll('#composer-send .jpdb-reader-word').length,
        },
        layout: {
            viewportWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
        },
    };
}

function assertCompactChromeSnapshot(snapshot, label) {
    assert(snapshot.compactControls.length === 3, `${label}: compact controls missing`, snapshot);
    for (const control of snapshot.compactControls) {
        assert(control.passiveChrome === 'true', `${label}: compact control was not marked as passive chrome`, control);
        assert(control.wordCount >= 1, `${label}: compact control was not annotated`, control);
        assert(control.rubyCount === 0, `${label}: compact control rendered ruby`, control);
        assert(control.height <= control.nativeHeight + 1, `${label}: compact control height grew`, control);
        assert(control.scrollHeight <= control.nativeScrollHeight + 1, `${label}: compact control reserved extra scroll height`, control);
        assert(control.words.every(word => word.inside), `${label}: reader word escaped compact control bounds`, control.words);
        assert(control.words.every(word => word.passive === 'true'), `${label}: compact control words were not passive`, control.words);
    }
    assert(snapshot.neighbors.every(neighbor => neighbor.centerHitsNeighbor), `${label}: neighboring tap targets were covered`, snapshot.neighbors);
    assert(snapshot.prose.wordCount >= 1, `${label}: prose link was not annotated`, snapshot.prose);
    assert(snapshot.prose.rubyText === 'せんきょ', `${label}: prose link lost ruby`, snapshot.prose);
    assert(snapshot.prose.passiveChrome === '', `${label}: prose link was marked as compact chrome`, snapshot.prose);
    assert(snapshot.composer.placeholderWords === 0, `${label}: composer placeholder was annotated as page text`, snapshot.composer);
    assert(snapshot.composer.inputMirror === '' && snapshot.composer.inputPlaceholderHidden === '', `${label}: input placeholder was mirrored as lookup content`, snapshot.composer);
    assert(snapshot.composer.textareaMirror === '' && snapshot.composer.textareaPlaceholderHidden === '', `${label}: textarea placeholder was mirrored as lookup content`, snapshot.composer);
    assert(snapshot.composer.sendWords === 0, `${label}: composer send control was annotated as page text`, snapshot.composer);
    assert(snapshot.layout.scrollWidth <= snapshot.layout.viewportWidth + 1, `${label}: annotations caused horizontal overflow`, snapshot.layout);
}

function isTransparentBackgroundPaint(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'none'
        || normalized === ''
        || (normalized.includes('linear-gradient') && !/rgba?\((?!0,\s*0,\s*0,\s*0\)|0 0 0\s*\/\s*0)/u.test(normalized));
}
