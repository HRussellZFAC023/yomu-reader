#!/usr/bin/env node
// Deterministic iPad-shaped Google Search regression fixture (not live visual
// proof). It pins base-text visibility and geometry for clamped result snippets,
// compact headings and result-local controls, including the WebKit failure mode
// where only rt survived and an ancestor expanded into a large empty gap.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createReaderSmokeSettings,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    launchOptionalBrowser,
    mockJpdbApiRequest,
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
const LANGUAGE_PROFILE_ID = 'google-search-smoke';

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
    ['辞書', '辞書', 'じしょ', 'dictionary', 'n', 100, ['known'], ['LHH']],
    ['英語', '英語', 'えいご', 'English', 'n', 100, ['known'], ['LHH']],
    ['意味', '意味', 'いみ', 'meaning', 'n', 100, ['known'], ['LH']],
    ['使い方', '使い方', 'つかいかた', 'usage', 'n', 100, ['known'], ['LHHH']],
    ['読み方', '読み方', 'よみかた', 'reading', 'n', 100, ['known'], ['LHHH']],
    ['英和辞書', '英和辞書', 'えいわじしょ', 'English-Japanese dictionary', 'n', 100, ['known'], ['LHHHH']],
    // Structurally valid token over punctuation only: renderer must discard it.
    ['...', '日本語', 'にほんご', 'invalid punctuation token', 'n', 100, ['known'], ['LHHH']],
];

const settings = createReaderSmokeSettings({
    learningTargetChosen: true,
    activeLanguageProfileId: LANGUAGE_PROFILE_ID,
    languageProfiles: [{
        schemaVersion: 2,
        id: LANGUAGE_PROFILE_ID,
        outputLanguage: 'en',
        learnerLanguage: 'en',
        targetLanguage: 'ja',
        uiLocale: 'en',
        parserProvider: 'auto',
        dictionaries: { installed: [], enabled: [], order: [] },
        definitionTranslationProviderIds: [],
    }],
    apiKey: 'mock-jpdb-token',
    preferJapaneseSiteLanguage: false,
});

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
main { padding: 18px 18px 56px; width: min(760px, 100vw); box-sizing: border-box; }
.MjjYud { display: flex; flex-direction: column; border-bottom: 1px solid #303134; padding: 10px 0 22px; }
.g { display: block; color: #bdc1c6; }
.site { display: flex; gap: 10px; align-items: center; color: #f1f3f4; margin-bottom: 6px; }
.icon { width: 34px; height: 34px; border-radius: 50%; background: #f1f3f4; }
h3 { margin: 8px 0 8px; color: #8ab4f8; font-size: 28px; line-height: 1.14; font-weight: 400; }
.VwiC3b { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; color: #bdc1c6; font-size: 18px; line-height: 24px; text-decoration: none; }
.clipped-heading { height: 34px; max-height: 34px; overflow: hidden; line-height: 32px; }
#chip { display: flex; align-items: center; justify-content: center; gap: 12px; height: 36px; max-height: 36px; overflow: hidden; margin: 22px 30px 0; padding: 0 18px; border-radius: 22px; background: #303134; color: #d5d7db; line-height: 18px; text-align: center; }
#chip-label { display: block; height: 18px; max-height: 18px; overflow: hidden; line-height: 18px; white-space: nowrap; }
.ask-card { margin: 30px 28px 0; padding: 20px; background: #25272c; color: #d5d7db; font-size: 21px; line-height: 1.55; }
.ask-button { display: inline-block; margin-top: 12px; padding: 6px 18px; border-radius: 18px; background: #a8c7fa; color: #202124; }
</style>
</head>
<body>
<main id="rcnt">
  <section id="search">
    <div id="primary-result" class="MjjYud">
      <article class="g">
        <div class="site"><span class="icon"></span><span>Google Play<br><small>https://play.google.com</small></span></div>
        <h3 class="LC20lb">SEO Checker - Google Play のアプリ</h3>
        <a class="VwiC3b" href="/url?q=https://play.google.com/store/apps/details">2026/02/17 — SEO Checkerを使用すると、あらゆるWebページの主要なSEO要素を数秒で分析して理解できます。あなたがデジタルマーケティング担当者、開発者、...</a>
        <div id="chip" role="button" tabindex="0"><span id="chip-label">検索結果を表示</span><span aria-hidden="true">⌄</span></div>
      </article>
    </div>
    <div id="weblio-result" class="MjjYud">
      <article class="g">
        <div class="site"><span class="icon"></span><span>Weblio辞書<br><small>https://ejje.weblio.jp</small></span></div>
        <h3 id="weblio-heading" class="LC20lb clipped-heading">英語「test」の意味・使い方・読み方 | Weblio英和辞書</h3>
        <div id="weblio-snippet" class="VwiC3b">英語でtestの意味は？ 日常での使い方と読み方を辞書で確認できます。</div>
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
    const { page, requests, consoleErrors } = await createGoogleSmokePage(browser, keylessPitchSettings, KEYLESS_GOOGLE_FIXTURE);
    try {
        await page.goto(KEYLESS_GOOGLE_URL, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        // Provider identity is private on an off-host page. Wait on the visible
        // pitch result; the request log below proves which provider supplied it.
        await page.waitForFunction(() => {
            const word = document.querySelector('.LC20lb .jpdb-reader-word[data-expression="コツ"]');
            return word
                && word.getAttribute('data-pitch-class') === 'atamadaka'
                && word.classList.contains('jpdb-pitch-atamadaka');
        }, null, { timeout: 20_000 });

        const snapshot = await page.evaluate(() => {
            const word = document.querySelector('.LC20lb .jpdb-reader-word[data-expression="コツ"]');
            return {
                wordCount: document.querySelectorAll('.jpdb-reader-word').length,
                text: word.textContent.trim(),
                pitchClass: word.getAttribute('data-pitch-class'),
                pitchAccent: word.getAttribute('data-pitch-accent'),
                className: word.className,
                hasPublicCardSource: word.hasAttribute('data-card-source'),
            };
        });
        assert(snapshot.text === 'コツ', 'Keyless Google pitch word text changed', snapshot);
        assert(snapshot.pitchClass === 'atamadaka', 'Keyless Google pitch did not hydrate before selection', { snapshot, requests, consoleErrors });
        assert(snapshot.pitchAccent === 'HLL', 'Keyless Google pitch metadata was not stamped onto the rendered word', snapshot);
        assert(!snapshot.hasPublicCardSource, 'Keyless Google word leaked its private provider identity into the host DOM', snapshot);
        assert(requests.some(request => request.kind === 'jiten' && request.endpoint === 'vocabulary/parse' && request.text === 'コツ'), 'Keyless Google pitch did not request the fallback term', requests);
        assert(requests.some(request => request.kind === 'jiten' && request.endpoint === 'vocabulary/424200/0/info'), 'Keyless Google pitch did not hydrate from Jiten detail', requests);
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
    const { page, requests, consoleErrors } = await createGoogleSmokePage(browser, settings, GOOGLE_FIXTURE);
    try {
        await page.goto(GOOGLE_URL, { waitUntil: 'domcontentloaded' });
        const baseline = await page.evaluate(snapshotGoogleLayout);
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        try {
            await page.waitForFunction(() => {
                const chip = document.querySelector('#chip');
                const snippetWords = document.querySelectorAll('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word');
                const snippetWord = document.querySelector('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word[data-expression="使用"]')
                    ?? snippetWords[0];
                const headingWords = document.querySelectorAll('#weblio-heading .jpdb-reader-word');
                const weblioSnippetWords = document.querySelectorAll('#weblio-snippet .jpdb-reader-word');
                return chip
                    && chip.textContent?.includes('検索結果')
                    && snippetWord
                    && snippetWords.length >= 4
                    && headingWords.length > 0
                    && weblioSnippetWords.length > 0;
            }, null, { timeout: 20_000 });
        } catch (error) {
            const debug = await page.evaluate(() => ({
                url: location.href,
                bodyText: document.body.textContent?.slice(0, 500) ?? '',
                words: document.querySelectorAll('.jpdb-reader-word').length,
                wordSamples: [...document.querySelectorAll('.jpdb-reader-word')].map(element => ({
                    text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
                    expression: element.getAttribute('data-expression') ?? '',
                    className: element.className,
                    parentClassName: element.parentElement?.className ?? '',
                    closestSnippet: Boolean(element.closest('.VwiC3b')),
                })).slice(0, 16),
                snippetWordSamples: [...document.querySelectorAll('.VwiC3b .jpdb-reader-word')].map(element => ({
                    text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
                    expression: element.getAttribute('data-expression') ?? '',
                    className: element.className,
                })).slice(0, 16),
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

        // Every annotated word keeps its status highlight at rest — content
        // and chrome alike. Chrome is protected by geometry, never by hiding.
        const beforeHover = await snapshotGoogleSearchFixture(page);
        assertGoogleSearchSnapshot(beforeHover, 'before hover', { expectStatusHighlight: true, baseline });

        const snippetWord = page.locator('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word[data-expression="使用"]').first();
        await snippetWord.hover();
        await page.waitForTimeout(150);
        const afterHover = await snapshotGoogleSearchFixture(page);
        assertGoogleSearchSnapshot(afterHover, 'after hover', { expectStatusHighlight: true, baseline });
        assert(afterHover.snippetFirstWord.backgroundImage.includes('linear-gradient'), 'Passive Google snippet word lost its highlight backing on hover', afterHover.snippetFirstWord);

        // Chrome-chip contract: a role=button chip is annotated AT REST, and
        // hovering changes nothing about whether the reading is shown. What
        // keeps that safe is geometry, not hiding — assertGoogleChip's
        // growth and clipping guards run on the at-rest snapshot above.
        await page.locator('#chip').hover();
        await page.waitForTimeout(250);
        assertGoogleChipRevealed((await snapshotGoogleSearchFixture(page)).chip, 'chip hover');
        await page.mouse.move(2, 2);
        await page.waitForTimeout(250);
        assertGoogleChipRevealed((await snapshotGoogleSearchFixture(page)).chip, 'chip after hover');

        await page.screenshot({ path: path.join(ARTIFACTS, `google-search-reader-smoke-${engineName}.png`), fullPage: true });
        return { baseline, beforeHover, afterHover, requests: requests.length };
    } finally {
        await browser.close().catch(() => undefined);
    }
}

async function createGoogleSmokePage(browser, settingsValue, fixture) {
    const requests = [];
    const consoleErrors = [];
    const context = await browser.newContext({
        ...devices['iPad Pro 11'],
        bypassCSP: true,
        colorScheme: 'dark',
        locale: 'ja-JP',
    });
    const page = await context.newPage();
    captureGoogleConsoleErrors(page, consoleErrors);
    await routeMockedHttpRequests(page, {
        requests,
        mockHttpRequest: mockedYomuApiRequest,
        isMockedApiOrigin,
    });
    await page.route('https://www.google.com/search**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixture,
    }));
    await page.exposeFunction(REQUEST_BRIDGE, request => mockedYomuBridgeRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settingsValue,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: REQUEST_BRIDGE,
    });
    return { page, requests, consoleErrors };
}

function captureGoogleConsoleErrors(page, consoleErrors) {
    page.on('pageerror', error => consoleErrors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
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
    return mockJpdbApiRequest(request, requestLog, VOCABULARY);
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

function snapshotGoogleLayout() {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const primary = rect('#primary-result');
    const weblio = rect('#weblio-result');
    const ask = rect('.ask-card');
    return {
        primaryHeight: primary.height,
        primarySnippetHeight: rect('#primary-result .VwiC3b').height,
        weblioHeight: weblio.height,
        weblioHeadingHeight: rect('#weblio-heading').height,
        weblioSnippetHeight: rect('#weblio-snippet').height,
        askGap: ask.top - weblio.bottom,
    };
}

async function snapshotGoogleSearchFixture(page) {
    const [summary, primarySnippet, weblioHeading, weblioSnippet] = await Promise.all([
        page.evaluate(snapshotGoogleSearchSummary),
        page.locator('#primary-result .VwiC3b').evaluate(snapshotGoogleClippedRow),
        page.locator('#weblio-heading').evaluate(snapshotGoogleClippedRow),
        page.locator('#weblio-snippet').evaluate(snapshotGoogleClippedRow),
    ]);
    return {
        ...summary,
        clippedRows: {
            primarySnippet: summarizeGoogleClippedRow(primarySnippet),
            weblioHeading: summarizeGoogleClippedRow(weblioHeading),
            weblioSnippet: summarizeGoogleClippedRow(weblioSnippet),
        },
    };
}

function snapshotGoogleClippedRow(element) {
    const rect = element.getBoundingClientRect();
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.jpdb-reader-text-mirror,rt,rp,.jpdb-reader-detached-furi').forEach(node => node.remove());
    const words = [...element.querySelectorAll('.jpdb-reader-word')];
    const rubies = [...element.querySelectorAll('rt,.jpdb-reader-furi')];
    const baseMetrics = words.map(word => {
        const base = word.querySelector('.jpdb-reader-ruby-base') ?? word;
        const baseRect = base.getBoundingClientRect();
        const style = getComputedStyle(base);
        return {
            visibility: style.visibility,
            display: style.display,
            opacity: style.opacity,
            width: baseRect.width,
            height: baseRect.height,
            top: baseRect.top,
            bottom: baseRect.bottom,
        };
    });
    const rubyMetrics = rubies.map(ruby => {
        const style = getComputedStyle(ruby);
        return { display: style.display, visibility: style.visibility, opacity: style.opacity };
    });
    return {
        text: clone.textContent.replace(/\s+/g, ' ').trim(),
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        clipStamp: element.getAttribute('data-yomu-clip-constrained') ?? '',
        wordCount: words.length,
        rubyCount: rubies.length,
        rubyMetrics,
        baseMetrics,
        rubyRoomCount: element.querySelectorAll('[data-yomu-ruby-room]').length
            + Number(element.hasAttribute('data-yomu-ruby-room')),
    };
}

function snapshotGoogleSearchSummary() {
    const chip = document.querySelector('#chip');
    const label = document.querySelector('#chip-label');
    const snippetFirstWord = document.querySelector('.VwiC3b .jpdb-reader-word.jpdb-reader-passive-word[data-expression="使用"]');
    const snippetStyle = getComputedStyle(snippetFirstWord);
    const chipRect = chip.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const primaryRect = document.querySelector('#primary-result').getBoundingClientRect();
    const primarySnippetRect = document.querySelector('#primary-result .VwiC3b').getBoundingClientRect();
    const weblioRect = document.querySelector('#weblio-result').getBoundingClientRect();
    const weblioHeadingRect = document.querySelector('#weblio-heading').getBoundingClientRect();
    const weblioSnippetRect = document.querySelector('#weblio-snippet').getBoundingClientRect();
    const askRect = document.querySelector('.ask-card').getBoundingClientRect();
    const projectedReadings = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')]
        .map(reading => {
            const rect = reading.getBoundingClientRect();
            const style = getComputedStyle(reading);
            const sourceLeft = Number(reading.dataset.yomuSourceLeft);
            const sourceTop = Number(reading.dataset.yomuSourceTop);
            const sourceWidth = Number(reading.dataset.yomuSourceWidth);
            const sourceHeight = Number(reading.dataset.yomuSourceHeight);
            return {
                text: reading.textContent?.trim() ?? '',
                expression: reading.dataset.yomuExpression ?? '',
                sourceCenterX: sourceLeft + sourceWidth / 2,
                sourceCenterY: sourceTop + sourceHeight / 2,
                centerDelta: (rect.left + rect.right) / 2 - sourceLeft - sourceWidth / 2,
                baseGap: sourceTop - rect.bottom,
                visible: style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && style.opacity !== '0'
                    && rect.width > 0
                    && rect.height > 0,
            };
        })
        .filter(reading => Number.isFinite(reading.sourceCenterX)
            && Number.isFinite(reading.sourceCenterY)
            && reading.sourceCenterX >= chipRect.left
            && reading.sourceCenterX <= chipRect.right
            && reading.sourceCenterY >= chipRect.top
            && reading.sourceCenterY <= chipRect.bottom);

    return {
        url: location.href,
        wordCount: document.querySelectorAll('.jpdb-reader-word').length,
        passiveWordCount: document.querySelectorAll('.jpdb-reader-word.jpdb-reader-passive-word').length,
        rejectedPunctuationWords: document.querySelectorAll('.jpdb-reader-word[data-expression="日本語"]').length,
        chip: {
            text: chip.textContent.replace(/\s+/g, '').trim(),
            decoration: chip.getAttribute('data-yomu-decoration'),
            rubyBaseCount: chip.querySelectorAll('.jpdb-reader-ruby-base').length,
            rubyCount: chip.querySelectorAll('rt').length,
            rubyRoom: chip.getAttribute('data-yomu-ruby-room'),
            labelRubyRoom: label.getAttribute('data-yomu-ruby-room'),
            mirrorHasRuby: Boolean(chip.querySelector('.jpdb-reader-text-mirror[data-jpdb-reader-has-ruby="true"]')),
            labelHiddenForMirror: getComputedStyle(label).visibility === 'hidden',
            labelOverflow: getComputedStyle(label).overflow,
            height: chipRect.height,
            labelHeight: labelRect.height,
            labelVisible: [labelRect.bottom <= chipRect.bottom + 1, labelRect.top >= chipRect.top - 1].every(Boolean),
            overflowY: getComputedStyle(chip).overflowY,
            styleHeight: chip.style.height,
            labelStyleHeight: label.style.height,
            projectedReadings,
        },
        snippetFirstWord: {
            text: snippetFirstWord.textContent.replace(/\s+/g, '').trim(),
            backgroundColor: snippetStyle.backgroundColor,
            backgroundImage: snippetStyle.backgroundImage,
            highlightSource: snippetStyle.getPropertyValue('--jpdb-reader-word-highlight-source').trim(),
            accessibleHighlight: snippetStyle.getPropertyValue('--jpdb-reader-word-accessible-highlight').trim(),
            color: snippetStyle.color,
        },
        layout: {
            viewportWidth: window.innerWidth,
            bodyWidth: Math.ceil(bodyRect.width),
            scrollWidth: document.documentElement.scrollWidth,
            primaryHeight: primaryRect.height,
            primarySnippetHeight: primarySnippetRect.height,
            weblioHeight: weblioRect.height,
            weblioHeadingHeight: weblioHeadingRect.height,
            weblioSnippetHeight: weblioSnippetRect.height,
            askGap: askRect.top - weblioRect.bottom,
            rubyRoomCount: document.querySelectorAll('[data-yomu-ruby-room]').length,
        },
    };
}

function googleBaseMetricIsVisible(base, row) {
    return [
        base.visibility !== 'hidden',
        base.display !== 'none',
        base.opacity !== '0',
        base.width > 0,
        base.height > 0,
        base.bottom <= row.bottom + 1,
        base.top >= row.top - 1,
    ].every(Boolean);
}

function googleRubyMetricIsHidden(ruby) {
    return [ruby.display === 'none', ruby.visibility === 'hidden', ruby.opacity === '0'].includes(true);
}

function summarizeGoogleClippedRow(row) {
    const { baseMetrics, rubyMetrics, ...summary } = row;
    return {
        ...summary,
        visibleBases: baseMetrics.some(base => googleBaseMetricIsVisible(base, row)),
        visibleRubyCount: rubyMetrics.filter(ruby => !googleRubyMetricIsHidden(ruby)).length,
    };
}

function assertGoogleSearchSnapshot(snapshot, label, options = { expectStatusHighlight: false, baseline: null }) {
    assert(snapshot.url.startsWith('https://www.google.com/search'), `${label}: smoke did not run on Google Search URL`, snapshot);
    assert(snapshot.wordCount >= 8, `${label}: Google fixture did not parse enough reader words`, snapshot);
    assert(snapshot.passiveWordCount >= 8, `${label}: Google fixture words were not passive`, snapshot);
    assertGoogleChip(snapshot.chip, label);
    assertGoogleClippedRows(snapshot, label);
    assertGoogleLayout(snapshot, label, options.baseline);
    assertGoogleHighlight(snapshot.snippetFirstWord, label, options.expectStatusHighlight);
}

function assertGoogleChip(chip, label) {
    assert(chip.text.includes('検索結果'), `${label}: Google chip text is missing`, chip);
    // Role/button chrome is sealed as interactive-passive: Yomu may add detached
    // readings, state colour, or a pitch underline, but must not add in-flow ruby,
    // hide the native label beneath a mirror, or grow the control's line box.
    assert(chip.decoration === 'interactive-passive', `${label}: Google chip decoration policy changed`, chip);
    assert(chip.rubyCount === 0, `${label}: Google chip gained layout-affecting ruby`, chip);
    assert(chip.rubyBaseCount > 0, `${label}: Google chip lost its detached reading bases`, chip);
    assert(!chip.mirrorHasRuby, `${label}: Google chip gained a ruby mirror`, chip);
    assert(!chip.labelHiddenForMirror, `${label}: Google chip label was hidden for a mirror`, chip);
    assert(chip.labelVisible, `${label}: Google chip label is clipped or invisible`, chip);
    assert(chip.rubyRoom == null, `${label}: Google chip reserved ruby room`, chip);
    assert(chip.labelRubyRoom == null, `${label}: Google chip label reserved ruby room`, chip);
    assert(chip.height <= 38, `${label}: Google chip grew beyond its plain-text layout`, chip);
    assert(chip.labelHeight <= 20, `${label}: Google chip label grew beyond its plain-text layout`, chip);
    assert(['hidden', 'visible'].includes(chip.labelOverflow), `${label}: Google chip label overflow contract changed`, chip);
    assert(chip.overflowY === 'hidden', `${label}: Google chip authored clipping was opened`, chip);
    // A role=button chip is chrome, and chrome is annotated at rest like any
    // other text. The guards above are what makes that safe: no ruby room, no
    // growth past the plain-text layout, authored clipping untouched. The
    // reading itself must be painted, not hidden until the user hovers.
    assert(chip.projectedReadings.length > 0,
        `${label}: Google chip is not annotated at rest`, chip);
    assert(chip.projectedReadings.every(reading => reading.visible),
        `${label}: Google chip reading is present but not visible at rest`, chip);
}

function assertGoogleChipRevealed(chip, label) {
    const readings = new Set(chip.projectedReadings.map(reading => reading.text));
    assert(readings.has('けんさくけっか') && readings.has('ひょうじ'),
        `${label}: Google chip hover readings are incomplete`, chip);
    assert(chip.projectedReadings.every(reading => reading.visible),
        `${label}: Google chip hover reading is not visible`, chip);
    assert(chip.projectedReadings.every(reading => Math.abs(reading.centerDelta) <= 1),
        `${label}: Google chip hover reading is not centred on its source`, chip);
    assert(chip.projectedReadings.every(reading => Math.abs(reading.baseGap) <= 1),
        `${label}: Google chip hover reading is detached from its source`, chip);
}

function assertGoogleClippedRows(snapshot, label) {
    const expectedRows = {
        primarySnippet: ['SEO Checkerを使用', '開発者'],
        weblioHeading: ['英語', '意味', '読み方', 'Weblio英和辞書'],
        weblioSnippet: ['英語でtestの意味', '使い方', '読み方'],
    };
    for (const [name, row] of Object.entries(snapshot.clippedRows)) {
        // A single-line fixed-height heading may deliberately remain native
        // text when its detached-reading mirror is retired by the clamp guard.
        // The snippets must still carry lookup annotations; the heading's
        // invariant is that it remains visible and clipped without ruby paint.
        const nativeClippedRow = row.clipStamp === 'true' && row.rubyCount === 0;
        assert(row.wordCount > 0 || nativeClippedRow, `${label}: ${name} was not safely rendered`, row);
        if (nativeClippedRow) continue;
        assert(row.visibleBases, `${label}: ${name} lost or clipped its base text`, row);
        assert(row.visibleRubyCount <= row.rubyCount, `${label}: ${name} reading metrics are inconsistent`, row);
        assert(row.rubyRoomCount === 0, `${label}: ${name} reserved ruby room`, row);
        // Two protected states: "true" rest-hides readings inside the clip;
        // "content" (growable clamp rows, owner rule 2026-07-19) keeps
        // IN-FLOW readings visible at rest while the row grows in flow.
        const inFlowContentRow = row.clipStamp === 'content' && row.visibleBases;
        assert([row.clipStamp === 'true', inFlowContentRow, row.rubyCount === 0].includes(true), `${label}: ${name} is not protected by the clip invariant`, row);
        for (const fragment of expectedRows[name]) {
            assert(row.text.includes(fragment), `${label}: ${name} lost text "${fragment}"`, row);
        }
    }
}

function assertGoogleLayout(snapshot, label, baseline) {
    assert(snapshot.layout.scrollWidth <= snapshot.layout.viewportWidth + 2, `${label}: Google result annotations caused horizontal overflow`, snapshot.layout);
    assert(snapshot.layout.rubyRoomCount === 0, `${label}: Google result cards received ruby-room growth`, snapshot.layout);
    assert(snapshot.rejectedPunctuationWords === 0, `${label}: punctuation-only parser output became a floating annotation`, snapshot);
    assert(snapshot.layout.primarySnippetHeight >= 18 && snapshot.layout.primarySnippetHeight <= baseline.primarySnippetHeight + 2, `${label}: primary snippet escaped or collapsed beyond one readable line`, { baseline, layout: snapshot.layout });
    assert(Math.abs(snapshot.layout.weblioHeadingHeight - baseline.weblioHeadingHeight) <= 2, `${label}: Weblio heading height changed`, { baseline, layout: snapshot.layout });
    // The Weblio snippet is a growable clamp row: in-flow at-rest readings
    // legitimately grow each line box by roughly one rt band (~0.55em). Bound
    // the growth so a runaway expansion still fails.
    assert(snapshot.layout.weblioSnippetHeight >= 18 && snapshot.layout.weblioSnippetHeight <= baseline.weblioSnippetHeight + 28, `${label}: Weblio snippet escaped or collapsed beyond its ruby-grown line`, { baseline, layout: snapshot.layout });
    assert(snapshot.layout.primaryHeight <= baseline.primaryHeight + 64, `${label}: primary result expanded into a large gap`, { baseline, layout: snapshot.layout });
    assert(snapshot.layout.weblioHeight <= baseline.weblioHeight + 64, `${label}: Weblio result expanded into a large gap`, { baseline, layout: snapshot.layout });
    assert(snapshot.layout.askGap <= baseline.askGap + 2, `${label}: a large empty gap appeared before the following card`, { baseline, layout: snapshot.layout });
}

function assertGoogleHighlight(word, label, expectStatusHighlight) {
    assert(word, `${label}: no passive snippet word found`, word);
    assert(isTransparentCssColor(word.highlightSource) !== expectStatusHighlight, `${label}: passive snippet highlight source has the wrong state`, word);
    assert(isTransparentCssColor(word.accessibleHighlight), `${label}: passive snippet word still has accessible highlight paint`, word);
    assert(word.backgroundColor === 'rgba(0, 0, 0, 0)', `${label}: passive snippet word has a filled background color`, word);
    assert(word.backgroundImage.includes('linear-gradient') === expectStatusHighlight, `${label}: passive snippet gradient state is wrong`, word);
}

function isTransparentCssColor(value) {
    const normalized = value.trim().toLowerCase();
    return new Set(['', 'transparent', '#0000', 'rgba(0, 0, 0, 0)']).has(normalized);
}
