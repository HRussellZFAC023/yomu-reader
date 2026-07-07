#!/usr/bin/env node
// Generic reddit-style community-header chrome smoke.
//
// Two invariants on a narrow flex <button> whose Japanese label is a SINGLE text
// node holding TWO kanji words ("投稿を作成"), plus a "詳細" button and a stats
// line, under reddit-like host CSS (narrow max-width flex buttons, small font,
// word-break/overflow-wrap, and a descendant rule that overrides the reading's
// white-space — reddit's cascade beats a plain, non-!important nowrap):
//
//   Bug 2a — every kanji word in the label carries a non-empty reading (rt):
//            ruby over BOTH 投稿 AND 作成, never just the leading word.
//   Bug 1  — no reading (rt) may stack onto a second line inside the narrow
//            chrome. Measured as getClientRects().length === 1 AND
//            offsetHeight <= ~1.6× the rt's own line-height. The stacked-kana
//            wrap (しょう/さい over 詳細) is a WebKit rendering behaviour that a
//            plain white-space:nowrap can't hold once host CSS overrides it, so
//            this smoke runs BOTH Chromium and WebKit — the WebKit pass is what
//            turns red before the rt-nowrap !important hardening and green after.
//
// Uses a synthetic local fixture served over loopback — never real reddit.
// Modeled on live-furigana-layout-smoke.mjs (createSmokePaths /
// assertBuiltArtifacts / addGmStorageBridgeInitScript /
// mockJpdbParseFromVocabulary).
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    launchOptionalBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    closeServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const JPDB_API_ORIGIN = 'https://jpdb.io';
const JPDB_API_PREFIX = '/api/v1/';
const REQUEST_BRIDGE = '__yomuRedditChromeRequest';
const PAGE_PATH = '/reddit-community-header.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);

// Tokenization: longest-match, so 訪問者 wins over 訪問 where present. The
// "投稿を作成" label deliberately yields two separate kanji word tokens (投稿
// then 作成) around the kana を, exactly like the reported reddit label.
const VOCABULARY = [
    ['投稿', '投稿', 'とうこう', 'post', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['作成', '作成', 'さくせい', 'create', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['詳細', '詳細', 'しょうさい', 'details', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['訪問者', '訪問者', 'ほうもんしゃ', 'visitor', ['noun'], 100, ['not-in-deck'], ['LHHHHH']],
    ['訪問', '訪問', 'ほうもん', 'visit', ['noun'], 100, ['not-in-deck'], ['LHHH']],
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

// Reddit-like community-header chrome. The action buttons are narrow flex items
// with an icon span before a single label text node; reddit sets word-break and
// overflow-wrap on its buttons and — critically — a descendant rule that forces
// the reading's white-space, so a plain nowrap can't hold the reading together
// (the `.action-button rt` override below reproduces that cascade). The
// create-post button holds two kanji words in one text node; the label wraps to
// its own line so both readings render, exercising Bug 2a.
const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reddit Community Header Fixture</title>
<style>
html, body { margin: 0; min-height: 100%; background: #0b1416; color: #d7dadc; font: 14px/1.2 system-ui, sans-serif; }
body { display: grid; place-items: start center; }
.shell { width: min(760px, 100vw); padding: 16px; box-sizing: border-box; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* Reddit-style action button: narrow flex item, icon + single label text node,
   word-break/overflow-wrap set on the button, small font. */
.action-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 96px;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid #343536;
  border-radius: 999px;
  background: #1a282d;
  color: #d7dadc;
  font: 600 14px/1.15 system-ui, sans-serif;
  cursor: pointer;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.action-button svg { flex: 0 0 auto; width: 16px; height: 16px; }
.action-button .flex { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
/* Reddit's cascade overrides descendant white-space; a non-!important nowrap on
   the reading loses to it, which is what let the reading stack in narrow chrome
   (Bug 1). Kept minimal and generic — it targets the annotation, not the app. */
.action-button rt { white-space: normal !important; word-break: break-all !important; }
/* A tightly-clamped label button (詳細): the base kanji fit on one line but the
   longer reading (しょうさい) is wider than the box, so with the rt white-space
   override above WebKit stacks the kana onto two lines unless the reading is
   pinned nowrap — this button is where Bug 1 turns red on WebKit before the fix.
   inline-block (not flex) gives the reading a block context it can wrap in. */
.detail-button { display: inline-block; text-align: center; max-width: 34px; padding: 4px 2px; }
.stats { margin-top: 16px; color: #818384; font-size: 13px; line-height: 1.4; }
</style>
</head>
<body>
<main class="shell">
  <div class="header-actions">
    <button id="create-post" class="action-button" type="button"><span class="flex"><span class="icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 3v14M3 10h14" stroke="currentColor" stroke-width="2" fill="none"/></svg></span>投稿を作成</span></button>
    <button id="detail" class="action-button detail-button" type="button"><span class="flex">詳細</span></button>
  </div>
  <div id="stats" class="stats">週に 61万 訪問者 と 1.1万</div>
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
}, 'Could not bind reddit community-header smoke server');

const ENGINES = [
    { name: 'chromium', type: chromium },
    { name: 'webkit', type: webkit },
];

const summaries = [];
const failures = [];
try {
    for (const engine of ENGINES) {
        const launched = await launchOptionalBrowser(engine.type, engine.name, { headless: true });
        if (launched.skipped) {
            summaries.push({ engine: engine.name, skipped: true, reason: launched.reason });
            continue;
        }
        try {
            summaries.push(await runEngine(engine.name, launched.browser));
        } catch (error) {
            failures.push(`${engine.name}: ${String(error).slice(0, 5000)}`);
        } finally {
            await launched.browser.close().catch(() => undefined);
        }
    }
} finally {
    await closeServer(server);
}

console.log(JSON.stringify({ summaries }, null, 2));
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
assert(summaries.some(summary => !summary.skipped), 'No browser engine was available to run the reddit-chrome smoke');
console.log('reddit-chrome-furigana smoke passed');

async function runEngine(engineName, browser) {
    const requests = [];
    const context = await browser.newContext({ bypassCSP: true, colorScheme: 'dark', locale: 'ja-JP', viewport: { width: 760, height: 520 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    try {
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

        await page.waitForFunction(() => document.querySelectorAll('#create-post .jpdb-reader-word').length >= 2, null, { timeout: 20_000 });
        // Let ruby-room sweeps + furigana render settle.
        await page.waitForTimeout(400);

        const snapshot = await page.evaluate(snapshotRedditChrome);
        const screenshot = path.join(ARTIFACTS, `reddit-chrome-furigana-smoke-${engineName}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });

        assert(pageErrors.length === 0, `${engineName}: page errors during smoke`, { pageErrors, snapshot });

        // Bug 2a: every kanji word in the create-post label must carry a non-empty rt.
        const createPost = snapshot.buttons['create-post'];
        assert(createPost, `${engineName}: create-post button was not scanned`, snapshot);
        for (const expression of ['投稿', '作成']) {
            const word = createPost.words.find(entry => entry.expression === expression || entry.text.includes(expression));
            assert(word, `${engineName}: no reader word for ${expression}`, createPost);
            assert(word.rubyText.length > 0, `${engineName} Bug 2a: create-post word "${expression}" rendered NO furigana (rt empty)`, createPost);
        }

        // Bug 1: no rt may stack to a second line inside any of the narrow chrome.
        assert(snapshot.wrappedReadings.length === 0, `${engineName} Bug 1: a reading (rt) stacked onto two lines inside narrow chrome`, snapshot.wrappedReadings);

        return { engine: engineName, screenshot, requests: requests.length, ...snapshot };
    } finally {
        await context.close().catch(() => undefined);
    }
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

function snapshotRedditChrome() {
    function furiText(word) {
        return [...word.querySelectorAll('rt,.jpdb-reader-furi')].map(rt => rt.textContent?.trim() ?? '').join('');
    }

    function wordSnapshot(word) {
        return {
            text: word.textContent?.replace(/\s+/g, '').trim() ?? '',
            expression: word.getAttribute('data-expression') ?? '',
            rubyCount: word.querySelectorAll('rt,.jpdb-reader-furi').length,
            rubyText: furiText(word),
        };
    }

    function buttonSnapshot(element) {
        const words = [...element.querySelectorAll('.jpdb-reader-word')].map(wordSnapshot);
        return {
            id: element.id,
            text: element.textContent?.replace(/\s+/g, '').trim() ?? '',
            passiveChrome: element.getAttribute('data-jpdb-reader-passive-chrome') ?? '',
            wordCount: words.length,
            rubyCount: element.querySelectorAll('rt,.jpdb-reader-furi').length,
            words,
        };
    }

    // A reading has wrapped when its rt renders across more than one client rect
    // OR its box is materially taller than one line of the rt's own computed
    // line-height (WebKit reports the stacked-kana wrap as a single, ~2× tall
    // client rect rather than two rects — pins Bug 1 either way).
    function wrappedReadings() {
        const issues = [];
        for (const rt of document.querySelectorAll('.jpdb-reader-word rt.jpdb-reader-furi, .jpdb-reader-word rt, .jpdb-reader-furi')) {
            const text = rt.textContent?.trim() ?? '';
            if (!text) continue;
            const rects = rt.getClientRects();
            const style = getComputedStyle(rt);
            const fontSize = parseFloat(style.fontSize) || 8;
            const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
            const tall = rt.offsetHeight > lineHeight * 1.6;
            if (rects.length > 1 || tall) {
                issues.push({ text, rects: rects.length, offsetHeight: rt.offsetHeight, lineHeight: Math.round(lineHeight), whiteSpace: style.whiteSpace, wordBreak: style.wordBreak });
            }
        }
        return issues;
    }

    const buttons = {};
    for (const element of document.querySelectorAll('button[id]')) {
        buttons[element.id] = buttonSnapshot(element);
    }
    const statsWords = [...document.querySelectorAll('#stats .jpdb-reader-word')].map(wordSnapshot);
    return {
        buttons,
        stats: {
            wordCount: statsWords.length,
            words: statsWords,
        },
        wrappedReadings: wrappedReadings(),
        layout: {
            viewportWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
        },
    };
}
