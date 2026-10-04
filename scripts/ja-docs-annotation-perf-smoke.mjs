#!/usr/bin/env node
// Deterministic fixture smoke for the hosted Japanese-docs annotation scope.
// Visual acceptance still uses the built VitePress site; this fixture isolates
// the runtime performance contract with repeatable mocked network responses.
// A second, one-root reading page guards how annotation cost grows with a
// page whose text shares one parent (see ONE_ROOT_PATH).
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
import { splitLongTasksAt } from './lib/long-task-budget.mjs';
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
// The budget covers Yomu's runtime work, not the one-time parse/compile/evaluate
// of the bundle. Each script below is pushed inline through Playwright, which
// serialises megabytes of text over CDP and compiles it on the main thread;
// neither a userscript manager (@run-at document-start) nor the hosted docs
// loader (<script src>, streamed compile) does that. A 2026-10-01 trace at the
// CI-matching throttle found the two tasks that failed every nightly there:
// the runtime companion's delivery and evaluation (~335 ms, no microtasks),
// then core's (~150 ms) with ~200 ms of reader init microtasks in the same
// task. The mark appended to core's own text splits that task, so init,
// scanning and annotation stay inside the budget and the evaluation before the
// mark is only reported (bundleEvaluationLongTasks).
const BUNDLE_EVALUATED_MARK = 'yomu-smoke:bundle-evaluated';
// An Aozora Bunko-style main_text block: <br>-separated lines that are all
// text nodes of ONE parent, which the generic scan handles with no adapter.
// A build whose apply slices each refreshed their whole root took about 3.7
// times as long to finish this page (150 lines, 2.5x throttle: 4.4-4.6 s ->
// 17.5 s, 15 s of it in long tasks) while the ja-docs page above stayed
// green: no single task got longer, there were just many more of them. So
// this page gates when annotation finishes and the main-thread time it took,
// not the longest task (2.0.7 already makes 0.8-0.9 s tasks here at 2.5x).
// At 2.5x on a loaded Mac (load ~30, 2026-10-04, alternating runs) 2.0.10
// finished in 6.9-8.2 s, 7.1-8.4 s of it in long tasks, and paced apply in
// 7.0-7.3 s (7.2-7.5 s); 2.0.7 took 4.4-4.6 s on a quiet machine. Slices
// capped near 240 ms, paying a long frame every few lines, took 8.7-10.2 s.
const ONE_ROOT_PATH = '/one-root-perf-fixture.html';
const ONE_ROOT_LINES = 150;
const ONE_ROOT_LINE_TEXT = `${TRY_ME_SENTENCE}学習を始める前に保存した単語の統計を確認して、調べて勉強した本は今日は新しい喫茶店にある。`;
const ONE_ROOT_COMPLETION_BUDGET_MS = 10_000;
const ONE_ROOT_LONG_TASK_TOTAL_BUDGET_MS = 10_000;
// YOMU_JA_DOCS_PERF_CPU_THROTTLE=2.5 on an Apple-silicon Mac reproduces the
// ubuntu-latest evaluation tasks (CI 337-438/300-343 ms, locally 329-372/
// 308-347 ms) and overstates the DOM-heavy apply task (CI 155-213 ms, locally
// 244-298 ms), so it is a slightly pessimistic stand-in for the nightly runner.
const CPU_THROTTLE_RATE = cpuThrottleRate(process.env.YOMU_JA_DOCS_PERF_CPU_THROTTLE);

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
    report.oneRoot = await runOneRootPerfSmoke(browser, fixture);
    writeFileSync(path.join(ARTIFACTS, 'ja-docs-annotation-perf-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

function handleFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === DOCS_PATH) return serveDocsFixture(response);
    if (url.pathname === ONE_ROOT_PATH) return serveOneRootFixture(response);
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function serveOneRootFixture(response) {
    const lines = Array.from({ length: ONE_ROOT_LINES }, (_, index) => `（${index + 1}）${ONE_ROOT_LINE_TEXT}`);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>よむ one-root reading performance fixture</title>
  <style>
    body { margin: 0; background: #fff; color: #000; font-size: 16px; line-height: 1.8; }
    .main_text { max-width: 46em; margin: 0 auto; padding: 24px 16px; }
  </style>
</head>
<body>
  <h1 class="title">読書</h1>
  <div class="main_text">${lines.join('<br />\n')}</div>
</body>
</html>`);
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

async function openAnnotatedPage(browser, fixtureServer, pagePath, requests) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    if (CPU_THROTTLE_RATE > 1) {
        const client = await context.newCDPSession(page);
        await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
    }
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
    await page.goto(`${fixtureServer.origin}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    const injectionStart = await page.evaluate(() => performance.now());
    await addScriptTagWithCspFallback(page, SCRIPT_PATH, {
        epilogue: `performance.mark(${JSON.stringify(BUNDLE_EVALUATED_MARK)});`,
    });
    return { context, page, injectionStart };
}

async function runJaDocsPerfSmoke(browser, fixtureServer) {
    const requests = [];
    const { context, page, injectionStart } = await openAnnotatedPage(browser, fixtureServer, DOCS_PATH, requests);
    try {
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
            const partial = await readAudit(page, injectionStart);
            throw new Error(`Content-column annotation never reached volume: ${JSON.stringify(partial)}`, { cause: error });
        }
        await page.waitForTimeout(1500);

        const audit = await readAudit(page, injectionStart);
        assert(audit.navWordCount === 0,
            `Navigation chrome outside the declared surfaces was annotated (${audit.navWordCount} words)`, audit);
        assert(audit.contentWordCount >= 120,
            `Content column under-annotated (${audit.contentWordCount} words)`, audit);
        assert(audit.contentContrastCount === audit.contentWordCount,
            `Content words missing sampled contrast (${audit.contentContrastCount}/${audit.contentWordCount})`, audit);
        assert(audit.tryMeWordCount >= 4, 'Try Me surface did not annotate', audit);
        const overBudget = audit.longTasks.filter(task => task.duration > LONG_TASK_BUDGET_MS);
        assert(overBudget.length === 0,
            `Long task(s) exceeded ${LONG_TASK_BUDGET_MS}ms: ${JSON.stringify(overBudget)}`, audit);

        const hover = await measureFirstHover(page);
        assert(hover.popoverOpened, 'Hovering a Try Me word never opened the popover', hover);
        assert(hover.latencyMs < FIRST_HOVER_BUDGET_MS,
            `First hover latency ${hover.latencyMs}ms exceeded ${FIRST_HOVER_BUDGET_MS}ms`, hover);

        await page.screenshot({ path: path.join(ARTIFACTS, 'ja-docs-annotation-perf-smoke.png'), fullPage: false });
        return { ok: true, cpuThrottleRate: CPU_THROTTLE_RATE, ...audit, firstHoverMs: hover.latencyMs };
    } finally {
        await context.close();
    }
}

async function runOneRootPerfSmoke(browser, fixtureServer) {
    const requests = [];
    const { context, page, injectionStart } = await openAnnotatedPage(browser, fixtureServer, ONE_ROOT_PATH, requests);
    try {
        const minimumWords = mockJpdbParseFromVocabulary({ text: [ONE_ROOT_LINE_TEXT] }, vocabulary).tokens[0].length * ONE_ROOT_LINES;
        const completedAt = await page.waitForFunction(({ minimumWords, markers }) => {
            const root = document.querySelector('.main_text');
            if (!root) return false;
            const bareLine = [...root.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes('喫茶店'));
            const words = [...root.querySelectorAll('.jpdb-reader-word')];
            const complete = [
                !bareLine,
                words.length >= minimumWords,
                words.filter(word => word.dataset.expression === '喫茶店').length === markers,
                words.every(word => word.style.getPropertyValue('--jpdb-reader-highlight-backdrop').trim()),
            ].every(Boolean);
            return complete ? performance.now() : false;
        }, { minimumWords, markers: ONE_ROOT_LINES * 2 }, { polling: 'raf', timeout: 120_000 }).then(handle => handle.jsonValue());
        // Include the scanner's delayed 1500ms geometry sweep and observer
        // delivery rather than closing as soon as the last text node changes.
        await page.waitForTimeout(2000);
        const { longTaskEntries, bundleEvaluatedAt } = await page.evaluate(auditFromDom, { injectionStart, mark: BUNDLE_EVALUATED_MARK });
        const start = bundleEvaluatedAt ?? injectionStart;
        const longTasks = splitLongTasksAt(longTaskEntries, start).after;
        const coverage = await page.evaluate(() => {
            const words = [...document.querySelectorAll('.main_text .jpdb-reader-word')];
            return { words: words.length, contrast: words.filter(word => word.style.getPropertyValue('--jpdb-reader-highlight-backdrop').trim()).length };
        });
        assert(coverage.words >= minimumWords && coverage.contrast === coverage.words, 'One-root follow-up lost word coverage or contrast', coverage);
        const audit = {
            lines: ONE_ROOT_LINES,
            wordCount: coverage.words,
            contrastCount: coverage.contrast,
            completionMs: Math.round(completedAt - start),
            longTaskTotalMs: Math.round(longTasks.reduce((total, task) => total + task.duration, 0)),
            longTaskCount: longTasks.length,
            requests: requests.length,
        };
        assert(audit.completionMs <= ONE_ROOT_COMPLETION_BUDGET_MS,
            `One-root page took ${audit.completionMs}ms to annotate (budget ${ONE_ROOT_COMPLETION_BUDGET_MS}ms)`, audit);
        assert(audit.longTaskTotalMs <= ONE_ROOT_LONG_TASK_TOTAL_BUDGET_MS,
            `One-root page spent ${audit.longTaskTotalMs}ms in long tasks (budget ${ONE_ROOT_LONG_TASK_TOTAL_BUDGET_MS}ms)`, audit);
        return audit;
    } finally {
        await context.close();
    }
}

async function readAudit(page, injectionStart) {
    const { longTaskEntries, bundleEvaluatedAt, ...audit } = await page.evaluate(auditFromDom,
        { injectionStart, mark: BUNDLE_EVALUATED_MARK });
    // Without the mark (core threw first), every task since injection counts.
    const { before, after } = splitLongTasksAt(longTaskEntries, bundleEvaluatedAt ?? injectionStart);
    return { ...audit, longTasks: roundedTasks(after), bundleEvaluationLongTasks: roundedTasks(before) };
}

function roundedTasks(tasks) {
    return tasks.map(task => ({ duration: Math.round(task.duration), startTime: Math.round(task.startTime) }));
}

function auditFromDom({ injectionStart, mark }) {
    const allWords = [...document.querySelectorAll('.jpdb-reader-word')];
    const content = document.getElementById('VPContent');
    const contentWords = content ? [...content.querySelectorAll('.jpdb-reader-word')]
        .filter(word => !word.closest('.yomu-try-me-text, [data-jpdb-reader-root]')) : [];
    const withContrast = words => words.filter(word => word.style.getPropertyValue('--jpdb-reader-highlight-backdrop').trim()).length;
    return {
        totalWordCount: allWords.length,
        tryMeWordCount: document.querySelectorAll('[data-try-me-sentence] .jpdb-reader-word').length,
        contentWordCount: contentWords.length,
        contentContrastCount: withContrast(contentWords),
        linkSummaryWordCount: document.querySelectorAll('.yomu-link-card > span .jpdb-reader-word').length,
        linkSummaryContrastCount: withContrast([...document.querySelectorAll('.yomu-link-card > span .jpdb-reader-word')]),
        heroWordCount: document.querySelectorAll('h1 > span.text .jpdb-reader-word').length,
        heroContrastCount: withContrast([...document.querySelectorAll('h1 > span.text .jpdb-reader-word')]),
        navWordCount: document.querySelectorAll('.VPNav .jpdb-reader-word').length,
        longTaskEntries: (window.__yomuLongTasks ?? []).filter(task => task.startTime >= injectionStart),
        bundleEvaluatedAt: performance.getEntriesByName(mark, 'mark')[0]?.startTime,
    };
}

function cpuThrottleRate(value = '1') {
    const rate = Number(value);
    if (Number.isNaN(rate) || rate < 1) throw new Error(`YOMU_JA_DOCS_PERF_CPU_THROTTLE must be a number >= 1, got "${value}"`);
    return rate;
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
