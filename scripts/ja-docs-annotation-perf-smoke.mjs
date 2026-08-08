#!/usr/bin/env node
// Deterministic fixture smoke for the hosted Japanese-docs annotation scope.
// Visual acceptance still uses the built VitePress site; this fixture isolates
// the runtime performance contract with repeatable mocked network responses.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createFixtureServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    routeMockedHttpRequests,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';
import { assertPopoverHeadwordMatchesLookup } from './lib/smoke-wait-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);

const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const DOCS_PATH = '/ja-docs-perf-fixture.html';
const TRY_ME_SENTENCE = '今日は静かな喫茶店で新しい本を読みました。';
const TRY_ME_TARGET_EXPRESSION = '喫茶店';
// Shared GitHub runners have repeatedly added 220-255 ms of wall time to a
// single otherwise-correct scan. Keep a hard regression ceiling, but leave
// enough host-noise headroom for the nightly gate to measure Yomu rather than
// transient runner contention.
const LONG_TASK_BUDGET_MS = 300;
const FIRST_HOVER_BUDGET_MS = 1000;

const settings = {
    onboardingSeen: true,
    apiKey: 'mock-jpdb-token',
    interfaceLanguage: 'ja',
    jpdbDefinitionsEnabled: true,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 120,
    popupActivationMode: 'hover',
    showFloatingButton: false,
    showFurigana: true,
    showPitchAccent: true,
    popupMode: 'popover',
    enableLogging: false,
};

const vocabulary = [
    ['今日は', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['静かな', '静か', 'しずか', 'quiet', ['na-adj'], 700, ['new'], ['LHH']],
    ['喫茶店', '喫茶店', 'きっさてん', 'coffee shop', ['n'], 1800, ['due'], ['LHHH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 650, ['learning'], ['LHHHH']],
    ['本', '本', 'ほん', 'book', ['n'], 200, ['known'], ['LH']],
    ['読みました', '読む', 'よみました', 'read', ['v5m'], 500, ['known'], ['LH']],
    ['学習', '学習', 'がくしゅう', 'study', ['n'], 300, ['known'], ['LHHHH']],
    ['始める', '始める', 'はじめる', 'to begin', ['v1'], 400, ['known'], ['LHHH']],
    ['保存', '保存', 'ほぞん', 'saving', ['n'], 900, ['new'], ['LHH']],
    ['単語', '単語', 'たんご', 'word', ['n'], 350, ['known'], ['LHH']],
    ['統計', '統計', 'とうけい', 'statistics', ['n'], 2200, ['new'], ['LHHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n'], 450, ['known'], ['LHHH']],
    ['調べて', '調べる', 'しらべて', 'to look up', ['v1'], 600, ['learning'], ['LHHH']],
    ['勉強', '勉強', 'べんきょう', 'study', ['n'], 250, ['known'], ['LHHH']],
];

// The 2026-07-19 contract: in Japanese mode the docs content column is itself
// a declared Reader Surface, so this copy MUST annotate — while staying inside
// the long-task budget. Sixty rows approximate the real homepage volume.
const CHROME_ROWS = Array.from({ length: 60 }, (_, index) => `
    <a class="yomu-link-card" href="/page-${index}">
        <strong>学習を始める ${index}</strong>
        <span>保存した単語や統計を確認します。ウェブページで単語を調べて勉強しましょう。</span>
    </a>`).join('\n');

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...userscriptCompanionPaths(SCRIPT_PATH)], ROOT, 'Run npm run build first.');

const fixture = await createFixtureServer(handleFixtureRequest, 'Could not bind Japanese docs performance fixture server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const report = await runJaDocsPerfSmoke(browser, fixture);
    writeFileSync(path.join(ARTIFACTS, 'ja-docs-annotation-perf-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

function handleFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === DOCS_PATH) return serveDocsFixture(response);
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function serveDocsFixture(response) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="ja" data-yomu-annotation-scope="surface">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>よむ Japanese docs performance fixture</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #22262b; color: #eef2f6; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    .yomu-link-card { display: block; color: #b7c0cc; padding: 4px 0; }
    .yomu-try-me-text { border-radius: 8px; background: #14171b; padding: 24px; font-size: 18px; line-height: 1.8; }
  </style>
</head>
<body>
  <header class="VPNav"><a href="/getting-started">学習を始める</a> <a href="/changelog">更新履歴を見る</a></header>
  <div class="VPContent is-home" id="VPContent" data-yomu-runtime-surface>
    <div class="VPHero VPHomeHero">
      <h1><span class="name">よむ</span> <span class="text">ページを離れずに日本語を読む</span></h1>
      <p class="tagline">ウェブページで単語を調べて、勉強のために例文を保存しましょう。</p>
    </div>
    <main>
      <article class="vp-doc">
        <p data-chrome-prose>よむは日本語テキスト、字幕、漫画画像を同じポップアップで読めます。</p>
        <div class="yomu-try-me-text" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
          <p class="yomu-try-me-label">Try me</p>
          <p data-try-me-sentence>${TRY_ME_SENTENCE}</p>
        </div>
        <div class="yomu-link-grid">${CHROME_ROWS}</div>
      </article>
    </main>
  </div>
</body>
</html>`);
}

async function runJaDocsPerfSmoke(browser, fixtureServer) {
    const requests = [];
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await routeMockedHttpRequests(page, {
        requests,
        mockHttpRequest: mockedRequest,
        isMockedApiOrigin: url => url.origin === JPDB_API_ORIGIN && url.pathname.startsWith(JPDB_API_PREFIX),
    });
    await page.exposeFunction('__yomuJaDocsPerfSmokeRequest', request => mockedRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuJaDocsPerfSmokeRequest',
    });
    await page.addInitScript(() => {
        window.__yomuLongTasks = [];
        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    window.__yomuLongTasks.push({ duration: entry.duration, startTime: entry.startTime });
                }
            });
            observer.observe({ type: 'longtask', buffered: true });
        } catch {
            // Chromium supports longtask; environments that do not still run
            // the annotation and first-hover assertions.
        }
    });
    try {
        await page.goto(`${fixtureServer.origin}${DOCS_PATH}`, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ path: CSS_PATH });
        const runtimeStart = await page.evaluate(() => performance.now());
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        try {
            await page.waitForFunction(targetExpression => {
                const words = [...document.querySelectorAll('[data-try-me-sentence] .jpdb-reader-word')];
                return words.length >= 4 && words.some(word => word.getAttribute('data-expression') === targetExpression);
            }, TRY_ME_TARGET_EXPRESSION, { timeout: 15_000 });
        } catch (error) {
            const diagnostic = await page.evaluate(() => ({
                initialized: Boolean(window.__yomuReaderAppInitialized),
                scope: document.documentElement.getAttribute('data-yomu-annotation-scope'),
                totalWords: document.querySelectorAll('.jpdb-reader-word').length,
                tryMeWords: [...document.querySelectorAll('[data-try-me-sentence] .jpdb-reader-word')]
                    .map(word => word.getAttribute('data-expression')),
                tryMeText: document.querySelector('[data-try-me-sentence]')?.textContent,
                readerRoots: document.querySelectorAll('[data-jpdb-reader-root]').length,
            }));
            throw new Error(`Try Me annotation timed out: ${JSON.stringify({ diagnostic, requests })}`, { cause: error });
        }
        // Japanese mode declares the content column itself as a surface, so
        // the link-grid copy must annotate too — wait for that scan to settle
        // instead of sampling a fixed instant.
        try {
            await page.waitForFunction(() => {
                const content = document.getElementById('VPContent');
                if (!content) return false;
                return [...content.querySelectorAll('.jpdb-reader-word')]
                    .filter(word => !word.closest('.yomu-try-me-text, [data-jpdb-reader-root]')).length >= 120;
            }, undefined, { timeout: 20_000 });
        } catch (error) {
            const partial = await page.evaluate(auditFromDom, runtimeStart);
            throw new Error(`Content-column annotation never reached volume: ${JSON.stringify(partial)}`, { cause: error });
        }
        await page.waitForTimeout(1500);

        const audit = await page.evaluate(auditFromDom, runtimeStart);
        assert(audit.navWordCount === 0,
            `Navigation chrome outside the declared surfaces was annotated (${audit.navWordCount} words)`, audit);
        assert(audit.contentWordCount >= 120,
            `Content column under-annotated (${audit.contentWordCount} words)`, audit);
        assert(audit.tryMeWordCount >= 4, 'Try Me surface did not annotate', audit);
        const overBudget = audit.longTasks.filter(task => task.duration > LONG_TASK_BUDGET_MS);
        assert(overBudget.length === 0,
            `Long task(s) exceeded ${LONG_TASK_BUDGET_MS}ms: ${JSON.stringify(overBudget)}`, audit);

        const hover = await measureFirstHover(page);
        assert(hover.popoverOpened, 'Hovering a Try Me word never opened the popover', hover);
        assert(hover.latencyMs < FIRST_HOVER_BUDGET_MS,
            `First hover latency ${hover.latencyMs}ms exceeded ${FIRST_HOVER_BUDGET_MS}ms`, hover);

        await page.screenshot({ path: path.join(ARTIFACTS, 'ja-docs-annotation-perf-smoke.png'), fullPage: false });
        return { ok: true, ...audit, firstHoverMs: hover.latencyMs };
    } finally {
        await context.close();
    }
}

function auditFromDom(runtimeStart) {
    const allWords = [...document.querySelectorAll('.jpdb-reader-word')];
    const content = document.getElementById('VPContent');
    const longTasks = (window.__yomuLongTasks ?? []).filter(task => task.startTime >= runtimeStart);
    return {
        totalWordCount: allWords.length,
        tryMeWordCount: document.querySelectorAll('[data-try-me-sentence] .jpdb-reader-word').length,
        contentWordCount: content
            ? [...content.querySelectorAll('.jpdb-reader-word')]
                .filter(word => !word.closest('.yomu-try-me-text, [data-jpdb-reader-root]')).length
            : 0,
        navWordCount: document.querySelectorAll('.VPNav .jpdb-reader-word').length,
        longTasks: longTasks.map(task => ({ duration: Math.round(task.duration), startTime: Math.round(task.startTime) })),
    };
}

async function measureFirstHover(page) {
    const started = Date.now();
    const word = page.locator(`[data-try-me-sentence] .jpdb-reader-word[data-expression="${TRY_ME_TARGET_EXPRESSION}"]`).first();
    await word.hover();
    try {
        await page.waitForSelector('.jpdb-reader-popover', { state: 'visible', timeout: 5_000 });
        await assertPopoverHeadwordMatchesLookup(page, word, { label: 'try-me hover' });
        return { popoverOpened: true, latencyMs: Date.now() - started };
    } catch {
        return { popoverOpened: false, latencyMs: Date.now() - started };
    }
}

function mockedRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin !== JPDB_API_ORIGIN || !url.pathname.startsWith(JPDB_API_PREFIX)) return null;
    const endpoint = url.pathname.slice(JPDB_API_PREFIX.length);
    const body = readRequestJson(request.data);
    requests.push({ kind: 'jpdb', endpoint });
    const handlers = {
        parse: () => mockJpdbParseFromVocabulary(body, vocabulary),
        'deck/list-vocabulary': () => ({ vocabulary: [] }),
        'list-user-decks': () => ({ decks: [] }),
    };
    return jsonHttpResponse(handlers[endpoint] ? handlers[endpoint]() : {});
}

function readRequestJson(data) {
    if (!data) return {};
    if (typeof data === 'string') return JSON.parse(data);
    if (data.kind === 'arraybuffer') return JSON.parse(Buffer.from(data.bytes ?? []).toString('utf8'));
    return data;
}
