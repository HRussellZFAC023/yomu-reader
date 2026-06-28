#!/usr/bin/env node
// Regression smoke for mobile article/prose scanning: annotated words must wrap
// inside narrow readable containers, while compact chrome stays height-stable.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    launchOptionalBrowser,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    routeMockedHttpRequests,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const REQUEST_BRIDGE = '__yomuMobileProseSmokeRequest';
const PAGE_URL = 'https://jp.investing.com/news/company-news/article-93CH-1570471';

assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);
mkdirSync(ARTIFACTS, { recursive: true });

const VOCABULARY = [
    ['最新ニュース', '最新ニュース', 'さいしんニュース', 'latest news', ['noun'], 100, ['known'], ['LHHHHHH']],
    ['人気ニュース', '人気ニュース', 'にんきニュース', 'popular news', ['noun'], 100, ['known'], ['LHHHHHH']],
    ['株式', '株式', 'かぶしき', 'stock', ['noun'], 100, ['known'], ['LHHH']],
    ['ロイター', 'ロイター', 'ロイター', 'Reuters', ['noun'], 100, ['known'], ['LHHH']],
    ['金曜日', '金曜日', 'きんようび', 'Friday', ['noun'], 100, ['known'], ['LHHHH']],
    ['報じた', '報じた', 'ほうじた', 'reported', ['verb'], 100, ['known'], ['LHHH']],
    ['SpaceXは700万株指数連動型ファンドIPO', 'SpaceXは700万株指数連動型ファンドIPO', 'スペースエックスはななひゃくまんかぶしすうれんどうがたファンドアイピーオー', 'mixed finance headline', ['noun'], 100, ['known'], ['LHHHHHHHHH']],
    ['採用', '採用', 'さいよう', 'adoption', ['noun'], 100, ['known'], ['LHHH']],
    ['正式', '正式', 'せいしき', 'official', ['noun'], 100, ['known'], ['LHHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['noun'], 100, ['known'], ['LHHH']],
    ['新規上場基準', '新規上場基準', 'しんきじょうじょうきじゅん', 'listing standard', ['noun'], 100, ['known'], ['LHHHHHH']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    preferJapaneseSiteLanguage: false,
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    lookupOnClick: true,
    lookupOnHover: false,
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
<title>Mobile Finance Article Fixture</title>
<style>
html, body { margin: 0; min-height: 100%; background: #fff; color: #2d333a; font: 24px/1.48 -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; overflow-x: hidden; }
header { position: sticky; top: 0; z-index: 1; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: end; gap: 12px; padding: 22px 16px 14px; background: #202124; color: #fff; }
.brand { font-size: 27px; font-weight: 800; letter-spacing: -0.04em; white-space: nowrap; }
.open-app { justify-self: center; max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b7bcc4; font-size: 17px; }
.search { font-size: 26px; }
nav { display: flex; gap: 28px; padding: 12px 16px 14px; overflow-x: auto; background: #202124; color: #fff; border-bottom: 1px solid #444; }
nav a { flex: 0 0 auto; color: inherit; text-decoration: none; font-size: 24px; line-height: 1.1; white-space: nowrap; }
main { width: 100%; box-sizing: border-box; overflow-x: clip; }
article { box-sizing: border-box; width: 100%; max-width: 390px; padding: 22px 16px 120px; overflow-wrap: anywhere; }
h1 { margin: 0 0 28px; font-size: 31px; font-weight: 400; line-height: 1.25; }
p { margin: 0 0 44px; font-size: 30px; line-height: 1.56; }
.promo { margin: 92px auto 72px; max-width: 340px; color: #086efc; text-align: center; font-size: 26px; font-weight: 700; line-height: 1.34; }
footer { position: fixed; inset-inline: 0; bottom: 0; display: flex; justify-content: space-around; padding: 10px 8px 20px; background: #151a20; color: #d8dde6; font-size: 18px; }
</style>
</head>
<body>
<header>
  <div class="brand">Investing<span style="font-weight:400">.com</span></div>
  <div class="open-app">アプリを開く</div>
  <div class="search">⌕</div>
</header>
<nav aria-label="sections">
  <a href="/news">最新ニュース</a>
  <a href="/popular">人気ニュース</a>
  <a href="/equities">株式</a>
</nav>
<main>
  <article>
    <h1>Investing.com -</h1>
    <p>ロイターが金曜日に報じたところによると、SpaceXは700万株指数連動型ファンドIPOへ採用される予定であり、正式に確認した。</p>
    <div class="promo">InvestingProでSpaceX、AI、テクノロジー株をトラッキング -- 今なら50%オフ</div>
    <p>ナスダックは、収益性、新規上場基準、公開株式の流通比率などを確認し、SpaceXは700万株指数連動型ファンドIPO が採用基準を満たしやすくなっている。</p>
  </article>
</main>
<footer>
  <span>マーケット</span>
  <span>ニュース</span>
  <span>人気の株式</span>
  <span>詳細を見る</span>
</footer>
</body>
</html>`;

const server = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
}, 'Could not bind mobile prose overflow smoke server');

try {
    const chromiumResult = await runCase('chromium', chromium, false);
    const webkitLaunch = await launchOptionalBrowser(webkit, 'webkit', { headless: true });
    const webkitResult = webkitLaunch.skipped
        ? { skipped: true, reason: webkitLaunch.reason }
        : await runCaseWithBrowser('webkit', webkitLaunch.browser, true);
    console.log(JSON.stringify({ chromium: chromiumResult, webkit: webkitResult }, null, 2));
    console.log('mobile-prose-overflow smoke passed');
} finally {
    await server.close();
}

async function runCase(engineName, browserType) {
    const browser = await launchSmokeBrowser(browserType, engineName, { headless: true });
    return runCaseWithBrowser(engineName, browser);
}

async function runCaseWithBrowser(engineName, browser, alreadyOwned = false) {
    const requests = [];
    const consoleErrors = [];
    try {
        const context = await browser.newContext({
            ...devices['iPhone 14'],
            bypassCSP: true,
            colorScheme: 'light',
            locale: 'ja-JP',
        });
        const page = await context.newPage();
        page.on('pageerror', error => consoleErrors.push(String(error)));
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        await routeMockedHttpRequests(page, {
            requests,
            mockHttpRequest: mockedYomuApiRequest,
            isMockedApiOrigin: url => url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX),
        });
        await page.route(PAGE_URL, route => route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: PAGE,
        }));
        await page.exposeFunction(REQUEST_BRIDGE, request => mockedYomuBridgeRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settings,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE,
        });

        await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(() => {
            return document.querySelectorAll('article .jpdb-reader-word.jpdb-reader-prose-word').length >= 4
                && document.querySelector('article .jpdb-reader-word.jpdb-reader-has-furi rt')
                && document.querySelectorAll('nav .jpdb-reader-word').length >= 1;
        }, null, { timeout: 20_000 });

        const snapshot = await page.evaluate(snapshotMobileProseFixture);
        assertMobileProseSnapshot(snapshot, engineName);
        await page.screenshot({ path: path.join(ARTIFACTS, `mobile-prose-overflow-smoke-${engineName}.png`), fullPage: true });
        return { snapshot, requests: requests.length, consoleErrors };
    } finally {
        await browser.close().catch(() => undefined);
    }
}

function mockedYomuBridgeRequest(request, requestLog) {
    const response = mockedYomuApiRequest(request, requestLog);
    if (response) return response;
    requestLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function mockedYomuApiRequest(request, requestLog) {
    const url = new URL(request.url);
    if (url.origin !== JPDB_API_ORIGIN || !url.pathname.startsWith(JPDB_API_PREFIX)) return null;
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readJsonBody(request.data);
    requestLog.push({ kind: 'jpdb', endpoint, text: body.text });
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [] });
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [] });
    return jsonHttpResponse({});
}

function snapshotMobileProseFixture() {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const article = document.querySelector('article');
    const articleRect = article?.getBoundingClientRect();
    const proseWords = [...document.querySelectorAll('article .jpdb-reader-word')].map(word => {
        const rect = word.getBoundingClientRect();
        const style = getComputedStyle(word);
        const furi = word.querySelector('rt.jpdb-reader-furi');
        const furiStyle = furi ? getComputedStyle(furi) : null;
        return {
            text: word.textContent?.replace(/\s+/g, '').slice(0, 48) ?? '',
            prose: word.classList.contains('jpdb-reader-prose-word'),
            passive: word.classList.contains('jpdb-reader-passive-word'),
            hasFuri: word.classList.contains('jpdb-reader-has-furi'),
            overflowWrap: style.overflowWrap,
            wordBreak: style.wordBreak,
            lineHeight: style.lineHeight,
            furiOverflowWrap: furiStyle?.overflowWrap ?? '',
            furiWhiteSpace: furiStyle?.whiteSpace ?? '',
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
        };
    });
    const chromeWords = [...document.querySelectorAll('header .jpdb-reader-word, nav .jpdb-reader-word, footer .jpdb-reader-word')].map(word => ({
        text: word.textContent?.replace(/\s+/g, '') ?? '',
        prose: word.classList.contains('jpdb-reader-prose-word'),
        passive: word.classList.contains('jpdb-reader-passive-word'),
        rubyCount: word.querySelectorAll('rt,.jpdb-reader-furi').length,
    }));
    return {
        viewportWidth,
        documentScrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        article: articleRect ? { left: articleRect.left, right: articleRect.right, width: articleRect.width } : null,
        proseWords,
        chromeWords,
        proseCount: proseWords.filter(word => word.prose).length,
        proseRubyCount: proseWords.filter(word => word.hasFuri).length,
        chromeProseCount: chromeWords.filter(word => word.prose).length,
    };
}

function assertMobileProseSnapshot(snapshot, engineName) {
    assert(snapshot.documentScrollWidth <= snapshot.viewportWidth + 2, `${engineName}: document overflowed horizontally`, snapshot);
    assert(snapshot.bodyScrollWidth <= snapshot.viewportWidth + 2, `${engineName}: body overflowed horizontally`, snapshot);
    assert(snapshot.article && snapshot.article.width <= snapshot.viewportWidth + 1, `${engineName}: article wider than viewport`, snapshot);
    assert(snapshot.proseCount >= 4, `${engineName}: article words were not marked as prose words`, snapshot);
    assert(snapshot.proseRubyCount >= 1, `${engineName}: prose lost furigana rendering`, snapshot);
    const badWrap = snapshot.proseWords.filter(word => word.prose && !word.passive && word.overflowWrap !== 'anywhere');
    assert(!badWrap.length, `${engineName}: prose words did not allow emergency wrapping`, badWrap);
    const badFuriWrap = snapshot.proseWords.filter(word => word.prose && word.hasFuri && !word.passive
        && (word.furiOverflowWrap !== 'anywhere' || word.furiWhiteSpace === 'nowrap'));
    assert(!badFuriWrap.length, `${engineName}: prose furigana stayed atomic and could force overflow`, badFuriWrap);
    const overflowing = snapshot.proseWords.filter(word => word.right > snapshot.viewportWidth + 2 || word.left < -2);
    assert(!overflowing.length, `${engineName}: annotated prose word escaped viewport`, overflowing);
    assert(snapshot.chromeProseCount === 0, `${engineName}: compact chrome inherited prose wrapping`, snapshot.chromeWords);
}
