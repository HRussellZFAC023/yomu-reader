#!/usr/bin/env node
// iPad-shaped Reddit annotation regression smoke.
//
// This is a deterministic loopback fixture, not visual proof from reddit.com.
// It reproduces the structural facts observed on the live site:
//   - a Join button two open-shadow boundaries below a Latin-only shell;
//   - fixed-height header/sort/share controls;
//   - a fixed card with 14-16px Japanese flair and vote/comment metadata;
//   - Latin-only and punctuation-only source ranges returned as bogus tokens.
//
// The safe contract is annotation without geometry-changing ruby in controls or
// compact metadata. Base text stays visible, buttons remain clickable, cards do
// not grow, and only source ranges that actually contain Japanese are painted.
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
const PAGE_PATH = '/reddit-ipad-annotation-regression.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);

const VOCABULARY = [
    ['投稿', '投稿', 'とうこう', 'post', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['作成', '作成', 'さくせい', 'create', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['参加', '参加', 'さんか', 'join', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['賛成票数順', '賛成票数順', 'さんせいひょうすうじゅん', 'top', ['noun'], 100, ['not-in-deck'], ['LHHHHHHH']],
    ['告知', '告知', 'こくち', 'announcement', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['賛成票', '賛成票', 'さんせいひょう', 'upvote', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['コメント', 'コメント', 'コメント', 'comment', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['時間', '時間', 'じかん', 'hour', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['前', '前', 'まえ', 'ago', ['noun'], 100, ['not-in-deck'], ['LH']],
    ['共有', '共有', 'きょうゆう', 'share', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    // Deliberately malformed parser outputs: valid offsets but non-Japanese
    // source slices. The renderer must discard both at its final boundary.
    ['r/singularity', '日本語', 'にほんご', 'invalid Latin token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['…', '日本語', 'にほんご', 'invalid punctuation token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
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
<title>Reddit iPad Annotation Regression</title>
<style>
html, body { margin: 0; min-height: 100%; background: #0b1416; color: #f2f4f5; font: 16px/1.25 system-ui, sans-serif; }
body { display: grid; place-items: start center; }
.shell { width: min(760px, 100vw); padding: 18px; box-sizing: border-box; }
.community { font-size: 30px; font-weight: 700; margin: 18px 0; }
.actions, .feed-tools, .post-actions { display: flex; align-items: center; gap: 10px; }
.safe-control {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; height: 40px; max-height: 40px; padding: 0 18px; overflow: hidden;
  border: 1px solid #748087; border-radius: 999px; background: #0b1416; color: #f2f4f5;
  font: 600 16px/20px system-ui, sans-serif; white-space: nowrap; cursor: pointer;
}
.feed-tools { justify-content: space-between; margin: 22px 0 16px; }
.highlight-card {
  box-sizing: border-box; display: block; height: 120px; max-height: 120px; overflow: hidden;
  padding: 18px 16px; border: 1px solid #343d42; border-radius: 18px; color: inherit; text-decoration: none;
}
.highlight-card h2 { margin: 0 0 14px; font-size: 22px; line-height: 26px; }
.card-row { display: block; height: 16px; max-height: 16px; overflow: hidden; font-size: 14px; line-height: 16px; color: #b7c2c8; }
.post { margin-top: 16px; padding-top: 14px; border-top: 1px solid #343d42; }
.post-meta { height: 20px; max-height: 20px; overflow: hidden; color: #b7c2c8; font-size: 14px; line-height: 20px; }
.post-meta time { display: inline-block; height: 20px; max-height: 20px; overflow: hidden; }
.post-actions { margin-top: 18px; }
#subreddit, #punctuation { display: inline-block; margin-right: 10px; }
</style>
</head>
<body>
<shreddit-app>
  <main class="shell">
    <div class="community"><span id="subreddit">r/singularity</span><span id="punctuation">…</span></div>
    <div class="actions">
      <button id="create-post" class="safe-control" type="button">＋ 投稿を作成</button>
      <reddit-header-shell id="join-shell"></reddit-header-shell>
    </div>
    <div class="feed-tools"><span>フィード</span><reddit-sort-control id="sort-shell"></reddit-sort-control></div>
    <a id="highlight-card" class="highlight-card" href="#highlight">
      <h2>Discord Server Link</h2>
      <span id="flair" class="card-row">告知</span>
      <span id="card-metadata" class="card-row">10件の賛成票・0件のコメント</span>
    </a>
    <article id="post" class="post">
      <div class="post-meta"><span>u/ResultBackground2470・</span><time id="post-meta" datetime="2026-07-10T19:01:00Z">2時間前</time></div>
      <h2>GPT Solves Yet Another Problem</h2>
      <div class="post-actions"><button id="share" class="safe-control" type="button">共有</button></div>
    </article>
  </main>
</shreddit-app>
<script>
window.__redditSmokeClicks = { create: 0, join: 0, sort: 0, share: 0 };
document.getElementById('create-post').addEventListener('click', () => { window.__redditSmokeClicks.create += 1; });
document.getElementById('share').addEventListener('click', () => { window.__redditSmokeClicks.share += 1; });
class RedditJoinControl extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{box-sizing:border-box;height:40px;max-height:40px;overflow:hidden;padding:0 18px;border:1px solid #748087;border-radius:999px;background:#0b1416;color:#f2f4f5;font:600 16px/20px system-ui;white-space:nowrap}</style><button id="join" type="button">参加</button>';
    root.getElementById('join').addEventListener('click', () => { window.__redditSmokeClicks.join += 1; });
  }
}
customElements.define('reddit-join-control', RedditJoinControl);
class RedditHeaderShell extends HTMLElement {
  constructor() {
    super();
    // No direct Japanese in this root: the scanner must look through the
    // nested component boundary to discover the visible label.
    this.attachShadow({ mode: 'open' }).innerHTML = '<reddit-join-control></reddit-join-control>';
  }
}
customElements.define('reddit-header-shell', RedditHeaderShell);
class RedditSortControl extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{box-sizing:border-box;height:40px;max-height:40px;overflow:hidden;padding:0 12px;border:0;background:#0b1416;color:#b7c2c8;font:600 14px/20px system-ui;white-space:nowrap}</style><button id="sort" type="button">賛成票数順⌄</button>';
    root.getElementById('sort').addEventListener('click', () => { window.__redditSmokeClicks.sort += 1; });
  }
}
customElements.define('reddit-sort-control', RedditSortControl);
</script>
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
}, 'Could not bind Reddit iPad regression server');

const summaries = [];
const failures = [];
try {
    for (const engine of [{ name: 'chromium', type: chromium }, { name: 'webkit', type: webkit }]) {
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
    await closeServer(server);
}

console.log(JSON.stringify({ summaries }, null, 2));
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
assert(summaries.some(summary => !summary.skipped), 'No browser engine was available to run the Reddit smoke');
console.log('reddit-chrome-furigana smoke passed');

async function runEngine(engineName, browser) {
    const requests = [];
    const context = await browser.newContext({
        bypassCSP: true,
        colorScheme: 'dark',
        locale: 'ja-JP',
        viewport: { width: 760, height: 980 },
    });
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
        const baseline = await page.evaluate(snapshotRedditLayout);
        await page.addStyleTag({ path: CSS_PATH });
        await page.addScriptTag({ path: SCRIPT_PATH });

        await page.waitForFunction(() => {
            const deep = (root, selector) => {
                const found = root.querySelector(selector);
                if (found) return found;
                for (const element of root.querySelectorAll('*')) {
                    if (element.shadowRoot) {
                        const nested = deep(element.shadowRoot, selector);
                        if (nested) return nested;
                    }
                }
                return null;
            };
            return document.querySelectorAll('#create-post .jpdb-reader-word').length >= 2
                && document.querySelectorAll('#card-metadata .jpdb-reader-word').length >= 2
                && document.querySelector('#share .jpdb-reader-word')
                && deep(document, '#join .jpdb-reader-word')
                && deep(document, '#sort .jpdb-reader-word');
        }, null, { timeout: 20_000 });
        await page.waitForTimeout(400);

        await page.locator('#create-post').click();
        await page.locator('#share').click();
        await page.evaluate(() => {
            const join = document.querySelector('reddit-header-shell').shadowRoot
                .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
            const sort = document.querySelector('reddit-sort-control').shadowRoot.querySelector('#sort');
            join.click();
            sort.click();
        });

        const snapshot = await page.evaluate(snapshotRedditRegression);
        const screenshot = path.join(ARTIFACTS, `reddit-chrome-furigana-smoke-${engineName}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        assertRedditRegression(engineName, baseline, snapshot, pageErrors);
        return { engine: engineName, screenshot, requests: requests.length, baseline, ...snapshot };
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

function snapshotRedditLayout() {
    const card = document.querySelector('#highlight-card').getBoundingClientRect();
    const post = document.querySelector('#post').getBoundingClientRect();
    return {
        createHeight: document.querySelector('#create-post').getBoundingClientRect().height,
        shareHeight: document.querySelector('#share').getBoundingClientRect().height,
        cardHeight: card.height,
        cardToPostGap: post.top - card.bottom,
    };
}

function snapshotRedditRegression() {
    function findDeep(selector, root = document) {
        const found = root.querySelector(selector);
        if (found) return found;
        for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
                const nested = findDeep(selector, element.shadowRoot);
                if (nested) return nested;
            }
        }
        return null;
    }

    function visibleChannelText(element) {
        const mirrors = [...element.querySelectorAll(':scope > .jpdb-reader-text-mirror')]
            .filter(mirror => getComputedStyle(mirror).visibility !== 'hidden');
        if (mirrors.length) return mirrors.map(mirror => mirror.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
        if (getComputedStyle(element).visibility === 'hidden') return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.jpdb-reader-text-mirror,rt,rp').forEach(node => node.remove());
        return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    function label(selector, expected) {
        const element = findDeep(selector);
        const rect = element.getBoundingClientRect();
        const words = [...element.querySelectorAll('.jpdb-reader-word')];
        const wordStates = words.map(word => {
            const wordRect = word.getBoundingClientRect();
            const style = getComputedStyle(word);
            return {
                width: wordRect.width,
                height: wordRect.height,
                visibility: style.visibility,
                opacity: style.opacity,
            };
        });
        return {
            expected,
            visibleText: visibleChannelText(element),
            height: rect.height,
            wordCount: words.length,
            expressions: words.map(word => word.getAttribute('data-expression') ?? ''),
            rubyCount: element.querySelectorAll('rt,.jpdb-reader-furi').length,
            rubyRoomCount: element.querySelectorAll('[data-yomu-ruby-room]').length + (element.hasAttribute('data-yomu-ruby-room') ? 1 : 0),
            visibleWords: wordStates.every(word => word.visibility !== 'hidden' && word.opacity !== '0' && word.width > 0 && word.height > 0),
        };
    }

    const card = document.querySelector('#highlight-card').getBoundingClientRect();
    const post = document.querySelector('#post').getBoundingClientRect();
    return {
        labels: {
            create: label('#create-post', '投稿を作成'),
            join: label('#join', '参加'),
            sort: label('#sort', '賛成票数順'),
            flair: label('#flair', '告知'),
            metadata: label('#card-metadata', '賛成票・コメント'),
            time: label('#post-meta', '時間前'),
            share: label('#share', '共有'),
        },
        rejected: {
            subredditWords: document.querySelectorAll('#subreddit .jpdb-reader-word').length,
            punctuationWords: document.querySelectorAll('#punctuation .jpdb-reader-word').length,
            subredditText: visibleChannelText(document.querySelector('#subreddit')),
            punctuationText: visibleChannelText(document.querySelector('#punctuation')),
        },
        layout: {
            createHeight: document.querySelector('#create-post').getBoundingClientRect().height,
            shareHeight: document.querySelector('#share').getBoundingClientRect().height,
            cardHeight: card.height,
            cardToPostGap: post.top - card.bottom,
            viewportWidth: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            rubyRoomCount: document.querySelectorAll('[data-yomu-ruby-room]').length,
        },
        clicks: window.__redditSmokeClicks,
    };
}

function assertRedditRegression(engineName, baseline, snapshot, pageErrors) {
    assert(pageErrors.length === 0, `${engineName}: page errors during Reddit smoke`, { pageErrors, snapshot });
    for (const [name, label] of Object.entries(snapshot.labels)) {
        assert(label.wordCount > 0, `${engineName}: ${name} was not annotated`, label);
        assert(label.rubyCount === 0, `${engineName}: ${name} gained layout-changing ruby`, label);
        assert(label.rubyRoomCount === 0, `${engineName}: ${name} reserved ruby room`, label);
        assert(label.visibleWords, `${engineName}: ${name} annotation base is clipped or invisible`, label);
        for (const fragment of label.expected.split('・')) {
            assert(label.visibleText.includes(fragment), `${engineName}: ${name} lost visible base text "${fragment}"`, label);
        }
    }
    assert(snapshot.rejected.subredditWords === 0, `${engineName}: Latin-only r/singularity was annotated`, snapshot.rejected);
    assert(snapshot.rejected.punctuationWords === 0, `${engineName}: punctuation-only range was annotated`, snapshot.rejected);
    assert(snapshot.rejected.subredditText === 'r/singularity' && snapshot.rejected.punctuationText === '…', `${engineName}: rejected source text changed`, snapshot.rejected);
    assert(Math.abs(snapshot.layout.createHeight - baseline.createHeight) <= 1, `${engineName}: create button height changed`, { baseline, layout: snapshot.layout });
    assert(Math.abs(snapshot.layout.shareHeight - baseline.shareHeight) <= 1, `${engineName}: share button height changed`, { baseline, layout: snapshot.layout });
    assert(Math.abs(snapshot.layout.cardHeight - baseline.cardHeight) <= 1, `${engineName}: highlight card grew`, { baseline, layout: snapshot.layout });
    assert(snapshot.layout.cardToPostGap <= baseline.cardToPostGap + 2, `${engineName}: a large gap appeared below the card`, { baseline, layout: snapshot.layout });
    assert(snapshot.layout.scrollWidth <= snapshot.layout.viewportWidth + 2, `${engineName}: annotations caused horizontal overflow`, snapshot.layout);
    assert(snapshot.layout.rubyRoomCount === 0, `${engineName}: Reddit fixture received ruby-room growth`, snapshot.layout);
    assert(Object.values(snapshot.clicks).every(count => count === 1), `${engineName}: an annotated control stopped receiving clicks`, snapshot.clicks);
}
