#!/usr/bin/env node
// Regression smoke for mobile Google Search reader styling: passive result words
// keep status highlight paint without drawing opaque background-color blocks, and
// clipped result-local controls must keep their ruby base text visible.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    launchOptionalBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    routeMockedHttpRequests,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT);
mkdirSync(ARTIFACTS, { recursive: true });

const GOOGLE_URL = 'https://www.google.com/search?q=seo%20checker&hl=ja&gl=JP';
const KEYLESS_GOOGLE_URL = 'https://www.google.com/search?q=kotu%20io&hl=ja&gl=JP';
const REQUEST_BRIDGE = '__yomuGoogleSearchSmokeRequest';
const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const JITEN_API_ORIGIN = 'https://api.jiten.moe';
const JITEN_API_PREFIX = '/api/';

const VOCABULARY = [
    ['アプリ', 'アプリ', 'アプリ', 'app', 'n', 100, ['not-in-deck'], ['LHH']],
    ['使用', '使用', 'しよう', 'use', 'n', 100, ['known'], ['LHH']],
    ['あらゆる', 'あらゆる', 'あらゆる', 'all kinds of', 'adj', 100, ['known'], ['LHHH']],
    ['ページ', 'ページ', 'ページ', 'page', 'n', 100, ['known'], ['LHH']],
    ['主要', '主要', 'しゅよう', 'main', 'adj', 100, ['known'], ['LHHH']],
    ['要素', '要素', 'ようそ', 'element', 'n', 100, ['known'], ['LHH']],
    ['数秒', '数秒', 'すうびょう', 'seconds', 'n', 100, ['known'], ['LHHH']],
    ['分析', '分析', 'ぶんせき', 'analysis', 'n', 100, ['known'], ['LHHH']],
    ['理解', '理解', 'りかい', 'understanding', 'n', 100, ['known'], ['LHH']],
    ['あなた', 'あなた', 'あなた', 'you', 'pn', 100, ['known'], ['LHH']],
    ['担当者', '担当者', 'たんとうしゃ', 'person in charge', 'n', 100, ['known'], ['LHHHH']],
    ['開発者', '開発者', 'かいはつしゃ', 'developer', 'n', 100, ['known'], ['LHHHH']],
    ['検索結果', '検索結果', 'けんさくけっか', 'search result', 'n', 100, ['known'], ['LHHHHH']],
    ['表示', '表示', 'ひょうじ', 'display', 'n', 100, ['known'], ['LHH']],
    ['質問', '質問', 'しつもん', 'question', 'n', 100, ['known'], ['LHH']],
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

const keylessPitchSettings = {
    ...settings,
    apiKey: '',
    jitenApiKey: '',
    localDictionariesEnabled: false,
    showPitchAccent: true,
    showFurigana: false,
    furiganaMode: 'off',
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
};

const GOOGLE_FIXTURE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Search Fixture</title>
<style>
html, body { margin: 0; background: #202124; color: #bdc1c6; font: 18px/1.35 Arial, sans-serif; }
main { padding: 18px 8px 56px; max-width: 430px; box-sizing: border-box; }
.MjjYud { border-bottom: 1px solid #303134; padding: 10px 0 22px; }
.g { display: block; color: #bdc1c6; }
.site { display: flex; gap: 10px; align-items: center; color: #f1f3f4; margin-bottom: 6px; }
.icon { width: 34px; height: 34px; border-radius: 50%; background: #f1f3f4; }
h3 { margin: 8px 0 8px; color: #8ab4f8; font-size: 28px; line-height: 1.14; font-weight: 400; }
.VwiC3b { color: #bdc1c6; font-size: 18px; line-height: 1.34; }
#chip { display: flex; align-items: center; justify-content: center; gap: 12px; height: 36px; max-height: 36px; overflow: hidden; margin: 22px 30px 0; padding: 0 18px; border-radius: 22px; background: #303134; color: #d5d7db; line-height: 18px; text-align: center; }
#chip-label { display: block; height: 18px; max-height: 18px; overflow: hidden; line-height: 18px; white-space: nowrap; }
.ask-card { margin: 30px 28px 0; padding: 20px; background: #25272c; color: #d5d7db; font-size: 21px; line-height: 1.55; }
.ask-button { display: inline-block; margin-top: 12px; padding: 6px 18px; border-radius: 18px; background: #a8c7fa; color: #202124; }
</style>
</head>
<body>
<main id="rcnt">
  <section id="search">
    <div class="MjjYud">
      <article class="g">
        <div class="site"><span class="icon"></span><span>Google Play<br><small>https://play.google.com</small></span></div>
        <h3 class="LC20lb">SEO Checker - Google Play のアプリ</h3>
        <a class="VwiC3b" href="/url?q=https://play.google.com/store/apps/details">2026/02/17 — SEO Checkerを使用すると、あらゆるWebページの主要なSEO要素を数秒で分析して理解できます。あなたがデジタルマーケティング担当者、開発者、...</a>
        <div id="chip" role="button" tabindex="0"><span id="chip-label">検索結果を表示</span><span aria-hidden="true">⌄</span></div>
      </article>
    </div>
    <div class="ask-card">Google アプリに質問して<br>あらゆることを調べましょう<br><span class="ask-button">アプリを試す</span></div>
  </section>
</main>
</body>
</html>`;

const KEYLESS_GOOGLE_FIXTURE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Search Keyless Pitch Fixture</title>
<style>
html, body { margin: 0; background: #202124; color: #bdc1c6; font: 18px/1.35 Arial, sans-serif; }
main { padding: 18px 8px 56px; max-width: 430px; box-sizing: border-box; }
.MjjYud { border-bottom: 1px solid #303134; padding: 10px 0 22px; }
.g { display: block; color: #bdc1c6; }
.site { display: flex; gap: 10px; align-items: center; color: #f1f3f4; margin-bottom: 6px; }
.icon { width: 34px; height: 34px; border-radius: 50%; background: #f1f3f4; }
h3 { margin: 8px 0 8px; color: #8ab4f8; font-size: 28px; line-height: 1.14; font-weight: 400; }
</style>
</head>
<body>
<main id="rcnt">
  <section id="search">
    <div class="MjjYud">
      <article class="g">
        <div class="site"><span class="icon"></span><span>kotu.io<br><small>https://kotu.io</small></span></div>
        <h3 class="LC20lb">コツ</h3>
      </article>
    </div>
  </section>
</main>
</body>
</html>`;

const server = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
}, 'Could not bind Google Search smoke server');

try {
    const chromiumResult = await runGoogleSearchCase('chromium', chromium);
    const keylessPitchResult = await runKeylessGooglePitchCase('chromium', chromium);
    const webkitResult = await runOptionalGoogleSearchCase('webkit', webkit);
    console.log(JSON.stringify({ chromium: chromiumResult, keylessPitch: keylessPitchResult, webkit: webkitResult }, null, 2));
    console.log('google-search-reader smoke passed');
} finally {
    await server.close();
}

async function runKeylessGooglePitchCase(engineName, browserType) {
    const browser = await launchSmokeBrowser(browserType, engineName, { headless: true });
    const requests = [];
    const consoleErrors = [];
    try {
        const context = await browser.newContext({
            ...devices['iPhone 14'],
            bypassCSP: true,
            colorScheme: 'dark',
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
            isMockedApiOrigin,
        });
        await page.route('https://www.google.com/search**', route => route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: KEYLESS_GOOGLE_FIXTURE,
        }));
        await page.exposeFunction(REQUEST_BRIDGE, request => mockedYomuBridgeRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: keylessPitchSettings,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE,
        });

        await page.goto(KEYLESS_GOOGLE_URL, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(() => {
            const word = document.querySelector('.LC20lb .jpdb-reader-word[data-expression="コツ"]');
            return word
                && word.getAttribute('data-card-source') === 'jiten'
                && word.getAttribute('data-pitch-class') === 'atamadaka'
                && word.classList.contains('jpdb-pitch-atamadaka');
        }, null, { timeout: 20_000 });

        const snapshot = await page.evaluate(() => {
            const word = document.querySelector('.LC20lb .jpdb-reader-word[data-expression="コツ"]');
            return {
                wordCount: document.querySelectorAll('.jpdb-reader-word').length,
                text: word?.textContent?.trim() ?? '',
                pitchClass: word?.getAttribute('data-pitch-class') ?? '',
                cardSource: word?.getAttribute('data-card-source') ?? '',
                pitchAccent: word?.getAttribute('data-pitch-accent') ?? '',
                className: word?.className ?? '',
            };
        });
        assert(snapshot.text === 'コツ', 'Keyless Google pitch word text changed', snapshot);
        assert(snapshot.pitchClass === 'atamadaka', 'Keyless Google pitch did not hydrate before selection', { snapshot, requests, consoleErrors });
        assert(snapshot.pitchAccent === 'HLL', 'Keyless Google pitch metadata was not stamped onto the rendered word', snapshot);
        assert(requests.some(request => request.kind === 'jiten' && request.endpoint === 'vocabulary/parse' && request.text === 'コツ'), 'Keyless Google pitch did not request the fallback term', requests);
        await page.screenshot({ path: path.join(ARTIFACTS, `google-search-keyless-pitch-${engineName}.png`), fullPage: true });
        return { snapshot, requests: requests.length };
    } finally {
        await browser.close().catch(() => undefined);
    }
}

async function runGoogleSearchCase(engineName, browserType) {
    const browser = await launchSmokeBrowser(browserType, engineName, { headless: true });
    return runGoogleSearchCaseWithBrowser(engineName, browser);
}

async function runOptionalGoogleSearchCase(engineName, browserType) {
    const launch = await launchOptionalBrowser(browserType, engineName, { headless: true });
    if (launch.skipped) return { skipped: true, reason: launch.reason };
    return runGoogleSearchCaseWithBrowser(engineName, launch.browser);
}

async function runGoogleSearchCaseWithBrowser(engineName, browser) {
    const requests = [];
    const consoleErrors = [];
    try {
        const context = await browser.newContext({
            ...devices['iPhone 14'],
            bypassCSP: true,
            colorScheme: 'dark',
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
            isMockedApiOrigin,
        });
        await page.route('https://www.google.com/search**', route => route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: GOOGLE_FIXTURE,
        }));
        await page.exposeFunction(REQUEST_BRIDGE, request => mockedYomuBridgeRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: settings,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE,
        });

        await page.goto(GOOGLE_URL, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        try {
            await page.waitForFunction(() => {
                const chip = document.querySelector('#chip');
                return chip
                    && chip.querySelector('.jpdb-reader-word .jpdb-reader-ruby-base')
                    && document.querySelectorAll('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word').length >= 4;
            }, null, { timeout: 20_000 });
        } catch (error) {
            const debug = await page.evaluate(() => ({
                url: location.href,
                bodyText: document.body.textContent?.slice(0, 500) ?? '',
                words: document.querySelectorAll('.jpdb-reader-word').length,
                parseKeys: [...document.querySelectorAll('[data-jpdb-reader-parse-key], [data-jpdb-reader-parse-loading-key]')].map(element => ({
                    tag: element.tagName,
                    id: element.id,
                    className: element.className,
                    text: element.textContent?.slice(0, 100) ?? '',
                    parseKey: element.getAttribute('data-jpdb-reader-parse-key') ?? '',
                    loadingKey: element.getAttribute('data-jpdb-reader-parse-loading-key') ?? '',
                })).slice(0, 10),
                htmlClass: document.documentElement.className,
            }));
            throw new Error(`Google Search smoke did not parse fixture: ${String(error)}\n${JSON.stringify({ debug, requests, consoleErrors }, null, 2)}`);
        }

        const beforeHover = await page.evaluate(snapshotGoogleSearchFixture);
        assertGoogleSearchSnapshot(beforeHover, 'before hover');

        const snippetWord = page.locator('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word').first();
        await snippetWord.hover();
        await page.waitForTimeout(150);
        const afterHover = await page.evaluate(snapshotGoogleSearchFixture);
        assertGoogleSearchSnapshot(afterHover, 'after hover');
        assert(afterHover.snippetFirstWord.backgroundImage.includes('linear-gradient'), 'Passive Google snippet word lost its highlight backing on hover', afterHover.snippetFirstWord);

        await page.screenshot({ path: path.join(ARTIFACTS, `google-search-reader-smoke-${engineName}.png`), fullPage: true });
        return { beforeHover, afterHover, requests: requests.length };
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
    if (url.origin === JITEN_API_ORIGIN && url.pathname.startsWith(JITEN_API_PREFIX)) {
        return mockedJitenPublicRequest(url, requestLog);
    }
    if (url.origin !== JPDB_API_ORIGIN || !url.pathname.startsWith(JPDB_API_PREFIX)) {
        return null;
    }
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readJsonBody(request.data);
    requestLog.push({ kind: 'jpdb', endpoint, text: body.text });
    if (endpoint === 'parse') return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    if (endpoint === 'deck/list-vocabulary') return jsonHttpResponse({ vocabulary: [] });
    if (endpoint === 'list-user-decks') return jsonHttpResponse({ decks: [] });
    return jsonHttpResponse({});
}

function isMockedApiOrigin(url) {
    return (url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX))
        || (url.origin === JITEN_API_ORIGIN && url.pathname.startsWith(JITEN_API_PREFIX));
}

function mockedJitenPublicRequest(url, requestLog) {
    const endpoint = url.pathname.slice(JITEN_API_PREFIX.length);
    if (endpoint === 'vocabulary/parse') {
        const text = url.searchParams.get('text') ?? '';
        requestLog.push({ kind: 'jiten', endpoint, text });
        return jsonHttpResponse(text.trim() === 'コツ'
            ? [{ wordId: 424200, readingIndex: 0, originalText: 'コツ' }]
            : []);
    }
    if (endpoint === 'vocabulary/424200/0/info') {
        requestLog.push({ kind: 'jiten', endpoint });
        return jsonHttpResponse({
            wordId: 424200,
            mainReading: { text: 'コツ', frequencyRank: 4200 },
            partsOfSpeech: ['noun'],
            definitions: [{ meanings: ['knack; trick'], partsOfSpeech: ['noun'] }],
            pitchAccents: [1],
        });
    }
    requestLog.push({ kind: 'jiten-unexpected', endpoint });
    return jsonHttpResponse({});
}

function snapshotGoogleSearchFixture() {
    const chip = document.querySelector('#chip');
    const label = document.querySelector('#chip-label');
    const chipBase = chip?.querySelector('.jpdb-reader-ruby-base');
    const chipRt = chip?.querySelector('rt');
    const snippetFirstWord = document.querySelector('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word');
    const snippetStyle = snippetFirstWord ? getComputedStyle(snippetFirstWord) : null;
    const baseRect = chipBase?.getBoundingClientRect();
    const chipRect = chip?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();

    return {
        url: location.href,
        wordCount: document.querySelectorAll('.jpdb-reader-word').length,
        passiveWordCount: document.querySelectorAll('.jpdb-reader-word.jpdb-reader-passive-word').length,
        chip: {
            text: chip?.textContent?.replace(/\s+/g, '').trim() ?? '',
            base: chipBase?.textContent?.trim() ?? '',
            ruby: chipRt?.textContent?.trim() ?? '',
            rubyRoom: chip?.getAttribute('data-yomu-ruby-room') ?? '',
            labelRubyRoom: label?.getAttribute('data-yomu-ruby-room') ?? '',
            height: chipRect?.height ?? 0,
            labelHeight: labelRect?.height ?? 0,
            baseVisible: Boolean(baseRect && chipRect && baseRect.bottom <= chipRect.bottom + 1 && baseRect.top >= chipRect.top - 1),
            overflowY: chip ? getComputedStyle(chip).overflowY : '',
            styleHeight: chip?.style.height ?? '',
            labelStyleHeight: label?.style.height ?? '',
        },
        snippetFirstWord: snippetStyle ? {
            text: snippetFirstWord.textContent?.replace(/\s+/g, '').trim() ?? '',
            backgroundColor: snippetStyle.backgroundColor,
            backgroundImage: snippetStyle.backgroundImage,
            highlightSource: snippetStyle.getPropertyValue('--jpdb-reader-word-highlight-source').trim(),
            accessibleHighlight: snippetStyle.getPropertyValue('--jpdb-reader-word-accessible-highlight').trim(),
            color: snippetStyle.color,
        } : null,
        layout: {
            viewportWidth: window.innerWidth,
            bodyWidth: Math.ceil(bodyRect.width),
            scrollWidth: document.documentElement.scrollWidth,
        },
    };
}

function assertGoogleSearchSnapshot(snapshot, label) {
    assert(snapshot.url.startsWith('https://www.google.com/search'), `${label}: smoke did not run on Google Search URL`, snapshot);
    assert(snapshot.wordCount >= 8, `${label}: Google fixture did not parse enough reader words`, snapshot);
    assert(snapshot.passiveWordCount >= 8, `${label}: Google fixture words were not passive`, snapshot);
    assert(snapshot.chip.base === '検索結果', `${label}: Google chip base text is missing`, snapshot.chip);
    assert(snapshot.chip.ruby === 'けんさくけっか', `${label}: Google chip ruby is missing`, snapshot.chip);
    assert(snapshot.chip.labelRubyRoom === 'true', `${label}: Google chip label did not reserve ruby room`, snapshot.chip);
    assert(snapshot.chip.baseVisible, `${label}: Google chip base text is still clipped`, snapshot.chip);
    assert(snapshot.chip.labelHeight > 18, `${label}: Google chip label kept its plain-text height`, snapshot.chip);
    assert(snapshot.layout.scrollWidth <= snapshot.layout.viewportWidth + 2, `${label}: Google result annotations caused horizontal overflow`, snapshot.layout);
    assert(snapshot.snippetFirstWord, `${label}: no passive snippet word found`, snapshot);
    assert(!isTransparentCssColor(snapshot.snippetFirstWord.highlightSource), `${label}: passive snippet word lost its status highlight source`, snapshot.snippetFirstWord);
    assert(snapshot.snippetFirstWord.accessibleHighlight === '', `${label}: passive snippet word still has accessible highlight paint`, snapshot.snippetFirstWord);
    assert(snapshot.snippetFirstWord.backgroundColor === 'rgba(0, 0, 0, 0)', `${label}: passive snippet word has a filled background color`, snapshot.snippetFirstWord);
    assert(snapshot.snippetFirstWord.backgroundImage.includes('linear-gradient'), `${label}: passive snippet word lost its gradient highlight backing`, snapshot.snippetFirstWord);
}

function isTransparentCssColor(value) {
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'transparent' || normalized === '#0000' || normalized === 'rgba(0, 0, 0, 0)';
}
