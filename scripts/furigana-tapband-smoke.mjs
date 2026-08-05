#!/usr/bin/env node
// The furigana dead tap band, in a real engine.
//
// A reader aims at what a reader can see, and above every annotated word that is
// the READING. This presses precisely there — the centre of the rt's own bounding
// box, proven to lie OUTSIDE every client rect of the word's base glyphs — and
// requires the popover to open for the word that reading belongs to.
//
// Only a browser can prove this. jsdom has no hit testing, so it cannot tell a
// live annotation from a dead one: the failure was pure cascade and geometry.
// Both halves of the fix are covered:
//   band=in-place   — `.jpdb-reader-word rt` must inherit its word's
//                     pointer-events instead of being pinned to none. The full
//                     stylesheet once overrode the critical subset's fix, so the
//                     band was dead on every page that could load the sheet;
//   band=projected  — a reading re-rooted into the paint-only overlay layer has
//                     no structural link to its word at all, and its clone stays
//                     pointer-events:none by design, so the press lands on the
//                     page behind it. It must still resolve to the owning word.
//
// The press is a real mouse click at real coordinates. Nothing here asserts on
// synthetic rects, and no assertion passes because an element merely exists.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    closeServer,
    createReaderSmokeSettings,
    createSmokePaths,
    installUserscriptFixtureBridge,
    jsonHttpResponse,
    launchOptionalBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    requestedBrowserCoverageFailures,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';
import { userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const REQUEST_BRIDGE = '__yomuFuriganaTapBandRequest';
const PAGE_PATH = '/furigana-tap-band.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const COMPANION_PATHS = userscriptCompanionPaths(SCRIPT_PATH);

// One expression per surface, so every assertion below names exactly one word:
// 詳細/読む in destructively annotated prose, 設定/保存 in the framework-owned
// prose that must be mirrored instead, 検索 in a control that keeps its own click.
const VOCABULARY = [
    ['詳細', '詳細', 'しょうさい', 'details', ['noun'], 1200, ['not-in-deck'], ['LHHH']],
    ['読む', '読む', 'よむ', 'to read', ['verb'], 400, ['not-in-deck'], ['LH']],
    ['設定', '設定', 'せってい', 'settings', ['noun'], 800, ['not-in-deck'], ['LHHH']],
    ['保存', '保存', 'ほぞん', 'save', ['noun'], 900, ['not-in-deck'], ['LHHH']],
    ['検索', '検索', 'けんさく', 'search', ['noun'], 700, ['not-in-deck'], ['LHHH']],
];

const settings = createReaderSmokeSettings({
    showFurigana: true,
    furiganaMode: 'all',
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    preferJapaneseSiteLanguage: false,
});

// Generous line-height so the reading has its own uncrowded band: the point of
// the smoke is the annotation, not how tightly it can be packed.
const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>furigana tap band</title>
<style>
  body { margin: 0; background: #fff; color: #111; font: 28px/2.6 "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; }
  #prose { margin: 90px 60px; }
  .control-row { margin: 60px; }
  button { font: 22px/1.6 "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; padding: 10px 22px; border: 1px solid #888; border-radius: 8px; background: #f4f4f4; color: #111; cursor: pointer; }
</style>
</head>
<body>
<main>
  <p id="prose">詳細を読む</p>
  <p id="framework">設定を保存</p>
  <div class="control-row"><button id="control" type="button">検索</button></div>
</main>
</body>
</html>`;

// #framework carries the property shapes React/Vue/Angular/Svelte leave on the
// nodes they own. Yomu must not mutate framework-owned text, so it annotates
// through an ADDITIVE MIRROR instead — and a mirrored word's reading is painted
// by the projection overlay rather than laid out in the line box. That is the
// structural fact the projected half of this smoke needs, reproduced without
// shipping a framework: real prose (not chrome), so a plain click must look up.
const FRAMEWORK_OWNERSHIP_SETUP = () => {
    const mark = () => {
        const host = document.getElementById('framework');
        if (!host) return false;
        Object.defineProperty(host, '__reactFiber$yomusmoke', { value: {}, configurable: true });
        Object.defineProperty(host, '__reactProps$yomusmoke', { value: {}, configurable: true });
        return true;
    };
    if (!mark()) document.addEventListener('DOMContentLoaded', mark, { once: true });
};

mkdirSync(ARTIFACTS, { recursive: true });
assert(COMPANION_PATHS.length > 0, 'Built userscript has no local companion fixtures to load');
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...COMPANION_PATHS], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
}, 'Could not bind furigana tap band smoke server');

const summaries = [];
const failures = [];
const requestedEngines = new Set(
    (process.env.YOMU_TAPBAND_SMOKE_ENGINES ?? 'chromium,firefox')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
);

try {
    for (const engine of [{ name: 'chromium', type: chromium }, { name: 'firefox', type: firefox }]
        .filter(engine => requestedEngines.has(engine.name))) {
        const launched = await launchOptionalBrowser(engine.type, engine.name, { headless: true });
        if (launched.skipped) {
            summaries.push({ engine: engine.name, skipped: true, reason: launched.reason });
            continue;
        }
        try {
            summaries.push(await runEngine(engine.name, launched.browser));
        } catch (error) {
            failures.push(`${engine.name}: ${String(error).slice(0, 8000)}`);
        } finally {
            await launched.browser.close().catch(() => undefined);
        }
    }
} finally {
    closeServer(server.server);
}

writeFileSync(path.join(ARTIFACTS, 'furigana-tapband-smoke.json'), JSON.stringify({ summaries, failures }, null, 2));
console.log(JSON.stringify({ summaries }, null, 2));
if (requestedEngines.size === 0) failures.push('No browser engines were requested');
failures.push(...requestedBrowserCoverageFailures(requestedEngines, summaries));
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
console.log(`furigana-tapband smoke passed (engines: ${summaries.map(summary => summary.engine).join(', ')})`);

async function runEngine(engineName, browser) {
    const requests = [];
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 900 } });
    try {
        const page = await context.newPage();
        await installUserscriptFixtureBridge(page, {
            requestBridgeName: REQUEST_BRIDGE,
            requestHandler: request => handleYomuRequest(request, requests),
            settings,
            css: readFileSync(CSS_PATH, 'utf8'),
        });
        await page.addInitScript(FRAMEWORK_OWNERSHIP_SETUP);
        await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ path: CSS_PATH });
        for (const companionPath of COMPANION_PATHS) await page.addScriptTag({ path: companionPath });
        await page.addScriptTag({ path: SCRIPT_PATH });

        await page.waitForFunction(
            () => document.querySelectorAll('#prose .jpdb-reader-word[data-expression]').length >= 2,
            null,
            { timeout: 20_000 },
        );

        const inPlace = await pressInPlaceReadingBand(page, engineName, '詳細');
        const projected = await pressProjectedReadingBand(page, engineName, '設定');
        const control = await pressControlReadingBand(page, engineName, '検索');

        const screenshot = path.join(ARTIFACTS, `furigana-tapband-${engineName}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
        return { engine: engineName, inPlace, projected, control, screenshot, requestCount: requests.length };
    } finally {
        await context.close().catch(() => undefined);
    }
}

/**
 * band=in-place: press the middle of the rt's own box. The reading must be
 * measurably clear of every base rect, or the press would prove nothing.
 */
async function pressInPlaceReadingBand(page, engineName, expression) {
    const band = await page.evaluate(readInPlaceBand, expression);
    assert(band, `${engineName}: no in-place reading band was rendered for ${expression}`);
    assert(band.readingHeight > 4,
        `${engineName}: the ${expression} reading has no measurable band to press`, band);
    // The decisive geometric fact: the press point is outside the word's own
    // glyph rects, so nothing but the annotation can be answering for it.
    assert(band.pressOutsideBase,
        `${engineName}: press point is inside the word's base rects, so this would not test the reading band`, band);

    await page.mouse.click(band.pressX, band.pressY);
    const headword = await waitForPopoverHeadword(page, engineName, band);
    assert(headword === expression,
        `${engineName}: pressing the ${expression} reading opened "${headword}"`, { band, headword });
    await dismissPopover(page);
    return { ...band, headword };
}

/**
 * band=projected: press the middle of an overlay clone's box. The clone is
 * pointer-events:none, so the press lands on the page behind it and only the
 * pointer path's projected-reading resolution can answer for it.
 */
async function pressProjectedReadingBand(page, engineName, expression) {
    await page.waitForFunction(
        value => [...document.querySelectorAll('[data-yomu-projected-reading="true"]')]
            .some(clone => clone.dataset.yomuExpression === value
                && clone.getBoundingClientRect().width > 0
                && getComputedStyle(clone).display !== 'none'),
        expression,
        { timeout: 20_000 },
    ).catch(() => undefined);
    const band = await page.evaluate(readProjectedBand, expression);
    assert(band, `${engineName}: no projected ${expression} reading was painted on the mirrored prose, so the overlay path went untested`);
    assert(band.cloneInert,
        `${engineName}: the projected reading is hit-testable; the overlay must stay paint-only`, band);
    // Proof the press cannot be answered by ordinary containment: the browser
    // hit-tests this point to the page behind the reading, not to any reader word.
    assert(!band.hitIsReaderWord,
        `${engineName}: the projected band hit-tests into a reader word, so this would not test the overlay path`, band);

    await page.mouse.click(band.pressX, band.pressY);
    const headword = await waitForPopoverHeadword(page, engineName, band);
    assert(headword === band.expression,
        `${engineName}: pressing the projected ${band.expression} reading opened "${headword}"`, { band, headword });
    await dismissPopover(page);
    return { ...band, headword };
}

/**
 * The other half of the contract. Making the reading live must not make it a
 * thief: a control's own reading band is still the control's, and the page's
 * click has to arrive. Getting this wrong is worse than the dead band — a
 * swallowed press breaks the site rather than merely doing nothing.
 */
async function pressControlReadingBand(page, engineName, expression) {
    await page.waitForFunction(
        value => [...document.querySelectorAll('[data-yomu-projected-reading="true"], rt.jpdb-reader-furi')]
            .some(reading => (reading.dataset.yomuExpression === value
                || reading.closest(`.jpdb-reader-word[data-expression="${value}"]`))
                && reading.getBoundingClientRect().width > 0
                && getComputedStyle(reading).display !== 'none'),
        expression,
        { timeout: 20_000 },
    ).catch(() => undefined);
    const band = await page.evaluate(readControlBand, expression);
    assert(band, `${engineName}: the ${expression} control label was not annotated, so host interaction went untested`);
    assert(band.pressInsideControl,
        `${engineName}: the ${expression} reading band is not over its own control`, band);

    await page.evaluate(() => {
        window.__yomuControlClicks = 0;
        document.getElementById('control')?.addEventListener('click', () => {
            window.__yomuControlClicks = (window.__yomuControlClicks ?? 0) + 1;
        });
    });
    await page.mouse.click(band.pressX, band.pressY);
    await page.waitForTimeout(700);
    const outcome = await page.evaluate(() => ({
        clicks: window.__yomuControlClicks ?? 0,
        popover: Boolean(document.querySelector('.jpdb-reader-popover')),
    }));
    assert(outcome.clicks === 1,
        `${engineName}: pressing a control's reading band did not deliver the control's own click`, { band, outcome });
    await dismissPopover(page);
    return { ...band, ...outcome };
}

async function waitForPopoverHeadword(page, engineName, band) {
    const handle = await page.waitForFunction(() => {
        const spelling = document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling');
        if (!spelling) return null;
        // rt/rp are the reading and its fallback parentheses, never the headword.
        const clone = spelling.cloneNode(true);
        for (const node of clone.querySelectorAll('rt, rp')) node.remove();
        const text = (clone.textContent ?? '').replace(/\s+/gu, '');
        return text || null;
    }, null, { timeout: 8_000 }).catch(() => null);
    assert(handle, `${engineName}: no popover opened for the reading band press`, band);
    return await handle.jsonValue();
}

async function dismissPopover(page) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.jpdb-reader-popover'), null, { timeout: 5_000 })
        .catch(() => undefined);
}

// --- page-side probes -------------------------------------------------------

function readInPlaceBand(expression) {
    const word = document.querySelector(`#prose .jpdb-reader-word[data-expression="${expression}"]`);
    const reading = word?.querySelector('rt.jpdb-reader-furi');
    if (!(word instanceof HTMLElement) || !(reading instanceof HTMLElement)) return null;
    const readingBox = reading.getBoundingClientRect();
    if (readingBox.width <= 0 || readingBox.height <= 0) return null;
    const pressX = readingBox.left + readingBox.width / 2;
    const pressY = readingBox.top + readingBox.height / 2;
    const baseRects = [...word.getClientRects()].map(rect => ({
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    }));
    const hit = document.elementFromPoint(pressX, pressY);
    return {
        band: 'in-place',
        expression,
        reading: reading.textContent ?? '',
        readingBox: boxJson(readingBox),
        baseRects,
        readingHeight: readingBox.height,
        pressX,
        pressY,
        pressOutsideBase: baseRects.every(rect =>
            pressX < rect.left || pressX > rect.right || pressY < rect.top || pressY > rect.bottom),
        hitTagName: hit?.tagName ?? '',
        hitIsReading: hit === reading,
    };

    function boxJson(rect) {
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    }
}

function readControlBand(expression) {
    const control = document.getElementById('control');
    const reading = [...document.querySelectorAll('[data-yomu-projected-reading="true"], rt.jpdb-reader-furi')]
        .find(candidate => candidate instanceof HTMLElement
            && (candidate.dataset.yomuExpression === expression
                || candidate.closest(`.jpdb-reader-word[data-expression="${expression}"]`))
            && candidate.getBoundingClientRect().width > 0
            && getComputedStyle(candidate).display !== 'none');
    if (!(control instanceof HTMLElement) || !(reading instanceof HTMLElement)) return null;
    const box = reading.getBoundingClientRect();
    const controlBox = control.getBoundingClientRect();
    const pressX = box.left + box.width / 2;
    const pressY = box.top + box.height / 2;
    return {
        band: 'control',
        expression,
        reading: reading.textContent ?? '',
        readingBox: boxJson(box),
        controlBox: boxJson(controlBox),
        pressX,
        pressY,
        pressInsideControl: pressX >= controlBox.left && pressX <= controlBox.right
            && pressY >= controlBox.top && pressY <= controlBox.bottom,
    };

    function boxJson(rect) {
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    }
}

function readProjectedBand(expression) {
    const clones = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')]
        .filter(candidate => candidate instanceof HTMLElement
            && candidate.dataset.yomuExpression === expression
            && candidate.getBoundingClientRect().width > 0
            && getComputedStyle(candidate).display !== 'none');
    const clone = clones[0];
    if (!(clone instanceof HTMLElement)) return null;
    const box = clone.getBoundingClientRect();
    const pressX = box.left + box.width / 2;
    const pressY = box.top + box.height / 2;
    const hit = document.elementFromPoint(pressX, pressY);
    // A mirrored word's own box is collapsed (the mirror is out of flow and its
    // words are placed against page-owned source ranges), so nothing about the
    // owning word can be found by hit testing this point. That IS the bug: the
    // only thing the browser can report here is the page behind the reading.
    return {
        band: 'projected',
        expression,
        reading: clone.textContent ?? '',
        cloneBox: boxJson(box),
        pressX,
        pressY,
        cloneInert: getComputedStyle(clone).pointerEvents === 'none',
        hitTagName: hit?.tagName ?? '',
        hitId: hit instanceof Element ? hit.id : '',
        hitIsClone: hit === clone,
        hitIsReaderWord: Boolean(hit?.closest?.('.jpdb-reader-word')),
        cloneCount: clones.length,
    };

    function boxJson(rect) {
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    }
}

// --- fixture plumbing -------------------------------------------------------

function handleYomuRequest(request, requestLog) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requestLog.push({ kind: 'jpdb-parse', text: body.text });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    }
    requestLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}
