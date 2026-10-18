#!/usr/bin/env node
// Host DOM churn must not restyle the whole page (W1-40).
//
// In 2.1.6, body-anchored :has() rules (the transcript and radial-menu states)
// marked <body> as a :has() anchor, and the sheet rules
// `.jpdb-reader-sheet:has(.jpdb-reader-popover-body) … > *` gave that anchor a
// whole-subtree invalidation set. Together, every host DOM insertion anywhere on
// a page that showed the puck invalidated every element under <body>: YouTube's
// 4 Hz time text alone restyled ~1,250 elements, ~41 ms/s of style work in plain
// playback. This drives the BUILT userscript graph and its @resource CSS in
// Chromium (the engine with the cost; WebKit measured flat) and checks:
//   1. trace: one host text-node insertion under <body> raises no
//      StyleInvalidatorInvalidationTracking event that invalidates all of BODY's (or HTML's)
//      descendants, also when the HOST page has its own body:has() rule with a
//      matching target. A control run appends one known-bad rule to the sheet and
//      must see that invalidation, or the scenario cannot catch a regression;
//   2. CDP metrics: 4 Hz host churn (time text, progress style, aria value) costs
//      at most 5 ms/s of style recalculation;
//   3. the popover sheet at iPhone and iPad sizes carries .jpdb-reader-sheet-has-body
//      and keeps the handle / scroll body / actions grid that class alone gives it, and with
//      YOMU_HAS_COMPARE=v2.1.6 its geometry is within 1 px of that release;
//   4. the check:css-has gate agrees with Chromium: on the host-has page without
//      Yomu, each row of scripts/lib/css-has-gate-probes.mjs (and the control rule)
//      causes whole-BODY invalidation exactly when the row says so, and the gate
//      refuses it, even with an allow comment, exactly then.
//
// The page is css-has-invalidation-mechanism-fixture: the cost is a property of
// the injected stylesheet plus any host insertion, not of a site's content, so a
// sized host DOM with a YouTube-shaped clock reaches the mechanism directly.
// YOMU_HAS_RELEASE=v2.1.6 runs the same checks against that release's committed
// core, runtime companion and CSS (proving the gate fails there).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
import { cdpMetrics, metricDelta } from './lib/cdp-performance-metrics.mjs';
import { findHasInvalidationRisks } from './lib/css-has-invalidation.mjs';
import { HAS_GATE_PROBES } from './lib/css-has-gate-probes.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const paths = createSmokePaths(import.meta.dirname);
const OUT = path.join(paths.artifacts, 'css-has-invalidation');
const PAGE_PATH = '/css-has-invalidation-mechanism-fixture.html';
const RECALC_BUDGET_MS_PER_S = 5;
const CHURN_SECONDS = Number(process.env.YOMU_HAS_CHURN_SECONDS || 6);
const LOOKUP_WORD = '日本語';
const VOCABULARY = [[LOOKUP_WORD, LOOKUP_WORD, 'にほんご', 'Japanese (language)', ['n'], 400, ['not-in-deck'], ['LHHH']]];
// Gave 20 whole-BODY invalidations beside the host body:has() rule (W1-40 review).
const CONTROL_RULE = ':is(.yomu-has-control:has(.yomu-has-control-inner) > :not(.yomu-has-control-skip)) { outline: 0; }';
const SHEET_VIEWPORTS = { iphone: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 } };
const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    jpdbMiningEnabled: false,
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnHover: false,
    lookupOnClick: true,
    popupActivationMode: 'click',
    popupMode: 'auto',
    showFloatingButton: true,
    enableLogging: false,
};

mkdirSync(OUT, { recursive: true });
const build = buildUnderTest(process.env.YOMU_HAS_RELEASE);
const compare = process.env.YOMU_HAS_COMPARE ? buildUnderTest(process.env.YOMU_HAS_COMPARE) : null;

const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixtureHtml({ hostHas: url.searchParams.has('host-has') }));
}, 'Could not bind css-has invalidation fixture server');

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const report = { build: build.label, compare: compare?.label ?? null, invalidation: {}, churn: {}, sheet: {}, gate: [] };
try {
    const gatePage = await browser.newPage();
    await gatePage.setContent(fixtureHtml({ hostHas: true }));
    const hostRules = await gatePage.evaluate(() => document.styleSheets[0].cssRules.length);
    for (const { selector, wholeSubtree } of [{ selector: CONTROL_RULE.replace(/\s*\{.*$/, ''), wholeSubtree: true }, ...HAS_GATE_PROBES]) {
        const rule = `${selector} { outline: 0; }`;
        const refused = findHasInvalidationRisks(`/* has-invalidation-allow: probe */\n${rule}`).some(finding => !finding.allowed);
        await gatePage.setContent(fixtureHtml({ hostHas: true }).replace('</style>', `${rule}\n</style>`));
        const parsed = await gatePage.evaluate(count => document.styleSheets[0].cssRules.length > count, hostRules);
        const { rootWholeSubtree } = await bodyInvalidationOnHostInsertion(gatePage);
        report.gate.push({ selector, expected: wholeSubtree, refused, rootWholeSubtree, parsed });
    }
    await gatePage.close();
    for (const variant of ['plain', 'host-has', 'control']) {
        const page = await openPage(build, { width: 1280, height: 800 }, variant !== 'plain', {}, variant === 'control' ? CONTROL_RULE : '');
        await page.locator('.jpdb-reader-fab').first().waitFor({ state: 'visible', timeout: 15_000 });
        report.invalidation[variant] = await bodyInvalidationOnHostInsertion(page);
        if (variant === 'plain') report.churn = await hostChurnRecalc(page);
        await page.context().close();
    }
    for (const [name, viewport] of Object.entries(SHEET_VIEWPORTS)) {
        report.sheet[name] = { current: await sheetSignature(build, viewport, name) };
        if (compare) {
            report.sheet[name].baseline = await sheetSignature(compare, viewport, `${name}-baseline`);
            report.sheet[name].maxDeltaPx = maxDelta(report.sheet[name].current.geometry, report.sheet[name].baseline.geometry);
        }
    }
} finally {
    writeFileSync(path.join(OUT, `report-${build.label}.json`), `${JSON.stringify(report, null, 2)}\n`);
    await closeSmokeBrowserAndServer(browser, server.server);
}
console.log(JSON.stringify(report, null, 2));

for (const probe of report.gate) {
    assert(probe.parsed, 'Chromium dropped a probe rule as invalid, so it measures nothing', probe);
    assert((probe.rootWholeSubtree > 0) === probe.expected,
        probe.expected ? 'Chromium no longer invalidates all of BODY for this probe; update css-has-gate-probes.mjs' : 'Chromium invalidates all of BODY for this probe', probe);
    assert(probe.refused === probe.expected,
        probe.refused ? 'gate refuses a rule Chromium handles without whole-BODY invalidation' : 'gate allows a rule that makes Chromium invalidate all of BODY', probe);
}
const { control, ...variants } = report.invalidation;
assert(control.rootWholeSubtree > 0, 'control: a known-bad rule beside the host body:has() rule caused no whole-BODY invalidation, so this smoke cannot detect one', control);
for (const [variant, result] of Object.entries(variants)) {
    assert(result.rootWholeSubtree === 0, `${variant}: a host text insertion invalidated every element under <body> or <html>`, result);
}
assert(report.churn.recalcStyleMsPerSecond <= RECALC_BUDGET_MS_PER_S,
    `4 Hz host churn cost ${report.churn.recalcStyleMsPerSecond} ms/s of style recalculation (budget ${RECALC_BUDGET_MS_PER_S})`, report.churn);
for (const [name, sheet] of Object.entries(report.sheet)) {
    const { layout } = sheet.current;
    // Each of these holds on the sheet only through .jpdb-reader-sheet-has-body,
    // so a popover write that skips setReaderPopoverHtml() fails here.
    assert(layout.hasBodyClass, `${name}: the sheet was rendered without setReaderPopoverHtml()`, layout);
    assert(layout.display === 'grid' && layout.padding === '0px' && layout.gridRowTracks === 3,
        `${name}: the sheet lost its handle / scroll body / actions grid`, layout);
    assert(layout.bodyOverflowY === 'auto' && layout.bodyGapBelowHandle !== null && Math.abs(layout.bodyGapBelowHandle) <= 1,
        `${name}: the sheet body is not the scroller directly under the handle`, layout);
    if (sheet.baseline) assert(sheet.maxDeltaPx <= 1, `${name}: sheet geometry moved more than 1 px from ${compare.label}`, sheet);
}
console.log(`css-has invalidation smoke passed (${build.label}).`);

async function openPage(target, viewport, hostHas, contextOptions = {}, extraCss = '') {
    const context = await browser.newContext({ bypassCSP: true, viewport, ...contextOptions });
    const page = await context.newPage();
    await page.exposeFunction('__yomuHasRequest', request => handleYomuRequest(request));
    const css = `${readFileSync(target.cssPath, 'utf8')}\n${extraCss}`;
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, css, requestBridgeName: '__yomuHasRequest' });
    await page.goto(`${server.origin}${PAGE_PATH}${hostHas ? '?host-has' : ''}`, { waitUntil: 'domcontentloaded' });
    await addScriptTagWithCspFallback(page, target.scriptPath);
    await page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${LOOKUP_WORD}"]`).first().waitFor({ timeout: 15_000 });
    // Let the boot scan, puck placement and furigana settle before measuring.
    await page.waitForTimeout(1_500);
    return page;
}

async function bodyInvalidationOnHostInsertion(page) {
    await browser.startTracing(page, {
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking'],
    });
    const forcedMs = await page.evaluate(() => {
        const host = document.querySelector('#host-time');
        void document.body.offsetHeight;
        const started = performance.now();
        const node = document.createTextNode(' ');
        document.body.append(node);
        void document.body.offsetHeight;
        node.remove();
        for (let tick = 0; tick < 20; tick++) {
            host.textContent = `0:${String(tick).padStart(2, '0')}`;
            void document.body.offsetHeight;
        }
        return (performance.now() - started) / 21;
    });
    const trace = JSON.parse((await browser.stopTracing()).toString('utf8'));
    const events = trace.traceEvents ?? trace;
    const invalidations = events.filter(event => event.name === 'StyleInvalidatorInvalidationTracking');
    const onRoot = invalidations.filter(event => /^(?:BODY|HTML)\b/i.test(event.args?.data?.nodeName ?? ''));
    const wholeSubtree = onRoot.filter(event => JSON.stringify(event.args?.data ?? {}).includes('allDescendantsMightBeInvalid'));
    return {
        forcedStyleMsPerInsertion: Number(forcedMs.toFixed(3)),
        rootInvalidations: onRoot.length,
        rootWholeSubtree: wholeSubtree.length,
        sample: wholeSubtree[0]?.args?.data ?? onRoot[0]?.args?.data ?? null,
    };
}

async function hostChurnRecalc(page) {
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    const before = await cdpMetrics(client);
    const started = Date.now();
    await page.evaluate(seconds => new Promise(resolve => {
        const time = document.querySelector('#host-time');
        const progress = document.querySelector('#host-progress');
        let tick = 0;
        const timer = setInterval(() => {
            tick++;
            time.textContent = `${Math.floor(tick / 240)}:${String(Math.floor(tick / 4) % 60).padStart(2, '0')}`;
            progress.style.width = `${(tick % 400) / 4}%`;
            progress.setAttribute('aria-valuenow', String(tick));
            if (tick >= seconds * 4) {
                clearInterval(timer);
                resolve();
            }
        }, 250);
    }), CHURN_SECONDS);
    const elapsed = (Date.now() - started) / 1000;
    const delta = metricDelta(before, await cdpMetrics(client));
    await client.detach();
    return {
        seconds: Number(elapsed.toFixed(2)),
        recalcStyleMsPerSecond: Number(((delta.RecalcStyleDuration * 1000) / elapsed).toFixed(2)),
        recalcsPerSecond: Number((delta.RecalcStyleCount / elapsed).toFixed(1)),
        nodes: (await cdpMetricsOnce(page)).Nodes,
    };
}

async function cdpMetricsOnce(page) {
    const client = await page.context().newCDPSession(page);
    await client.send('Performance.enable');
    const metrics = await cdpMetrics(client);
    await client.detach();
    return metrics;
}

async function sheetSignature(target, viewport, name) {
    const page = await openPage(target, viewport, false, { hasTouch: true, isMobile: true });
    await page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${LOOKUP_WORD}"]`).first().tap();
    const signature = await (await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover.jpdb-reader-sheet');
        const body = popover?.querySelector('.jpdb-reader-popover-body');
        const header = body?.querySelector('.jpdb-reader-header');
        if (!(popover instanceof HTMLElement) || !(body instanceof HTMLElement) || !header) return null;
        if (popover.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')) return null;
        const box = element => {
            if (!(element instanceof HTMLElement)) return null;
            const rect = element.getBoundingClientRect();
            return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        };
        const style = getComputedStyle(popover);
        const handle = popover.querySelector('.jpdb-reader-sheet-handle');
        return {
            layout: {
                display: style.display,
                padding: style.padding,
                gridRowTracks: style.gridTemplateRows.trim().split(/\s+/).length,
                bodyOverflowY: getComputedStyle(body).overflowY,
                bodyGapBelowHandle: handle ? body.getBoundingClientRect().top - handle.getBoundingClientRect().bottom : null,
                hasBodyClass: popover.classList.contains('jpdb-reader-sheet-has-body'),
            },
            geometry: {
                popover: box(popover),
                handle: box(popover.querySelector('.jpdb-reader-sheet-handle')),
                body: box(body),
                header: box(header),
                actions: box(popover.querySelector('.jpdb-reader-actions')),
                bodyScrollHeight: body.scrollHeight,
                bodyClientHeight: body.clientHeight,
            },
        };
    }, null, { timeout: 15_000, polling: 100 })).jsonValue();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `sheet-${name}-${target.label}.png`) });
    await page.context().close();
    return signature;
}

function maxDelta(current, baseline) {
    let max = 0;
    const walk = (a, b) => {
        if (typeof a === 'number' && typeof b === 'number') max = Math.max(max, Math.abs(a - b));
        else if (a && b && typeof a === 'object') for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key]);
        else if (a !== b) max = Infinity;
    };
    walk(current, baseline);
    return Number(max.toFixed(2));
}

// The current build, or a release's committed core + companion + CSS from git.
function buildUnderTest(release) {
    if (!release) {
        assertBuiltArtifacts([paths.scriptPath, paths.cssPath, ...userscriptCompanionPaths(paths.scriptPath)], paths.root, 'Run npm run build first.');
        return { label: 'current', scriptPath: paths.scriptPath, cssPath: paths.cssPath };
    }
    const root = mkdtempSync(path.join(os.tmpdir(), `yomu-has-${release}-`));
    const show = file => execFileSync('git', ['show', `${release}:${file}`], { cwd: paths.root, maxBuffer: 64 * 1024 * 1024 });
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    mkdirSync(path.join(root, 'docs', 'public', 'greasyfork'), { recursive: true });
    const scriptPath = path.join(root, 'dist', 'yomu.user.js');
    writeFileSync(scriptPath, show('dist/yomu.user.js'));
    writeFileSync(path.join(root, 'dist', 'yomu.css'), show('dist/yomu.css'));
    const core = readFileSync(scriptPath, 'utf8');
    for (const [, name] of core.matchAll(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([\w.-]+)/gmu)) {
        writeFileSync(path.join(root, 'docs', 'public', 'greasyfork', name), show(`docs/public/greasyfork/${name}`));
    }
    return { label: release, scriptPath, cssPath: path.join(root, 'dist', 'yomu.css') };
}

function fixtureHtml({ hostHas }) {
    // ~1,250 host elements, shaped like a watch page's chrome and feed.
    const feed = Array.from({ length: 150 }, (_, index) => `<div class="host-card"><a href="#v${index}"><span class="host-thumb"></span></a><div class="host-meta"><h3><span>Video ${index}</span></h3><p><span>Channel</span><span>${index}K views</span></p><div class="host-badges"><span class="host-target">New</span></div></div></div>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>css-has-invalidation-mechanism-fixture</title>
<style>
body { margin: 0; font: 14px/1.5 system-ui, sans-serif; }
.host-player { position: relative; height: 240px; background: #111; color: #fff; }
.host-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; display: flex; gap: 8px; align-items: center; padding: 0 12px; }
#host-progress { height: 3px; background: red; width: 0; }
.host-feed { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 12px; }
.host-thumb { display: block; height: 90px; background: #ddd; }
${hostHas ? 'body:has(.host-flag) .host-target { outline: 1px solid; }' : ''}
</style></head>
<body><header class="host-masthead"><span>Host</span></header>
<div class="host-player"><div class="host-bar"><div id="host-progress" role="slider" aria-valuenow="0"></div><span id="host-time">0:00</span></div></div>
<main><p data-smoke-sentence style="font: 18px/1.8 system-ui; margin: 24px 16px;">日本語は東アジアの言語です。</p>
<div class="host-feed">${feed}</div></main></body></html>`;
}

function handleYomuRequest(request) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        return jsonHttpResponse(mockJpdbParseFromVocabulary(readJsonBody(request.data), VOCABULARY, {
            tokenReading: () => [['日本語', 'にほんご']],
        }));
    }
    return { status: 404, responseText: '' };
}
