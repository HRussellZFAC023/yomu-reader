#!/usr/bin/env node
// iPad-shaped Reddit annotation regression smoke.
//
// This is a deterministic routed fixture, not visual proof from reddit.com.
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
    assert,
    assertBuiltArtifacts,
    createReaderSmokeSettings,
    createSmokePaths,
    installUserscriptFixtureBridge,
    launchOptionalBrowser,
    mockJpdbApiRequest,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const REQUEST_BRIDGE = '__yomuRedditChromeRequest';
const PAGE_PATH = '/reddit-ipad-annotation-regression.html';
const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);

const VOCABULARY = [
    ['投稿', '投稿', 'とうこう', 'post', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['作成', '作成', 'さくせい', 'create', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['参加', '参加', 'さんか', 'join', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['賛成票率順', '賛成票率順', 'さんせいひょうりつじゅん', 'top', ['noun'], 100, ['not-in-deck'], ['LHHHHHHH']],
    ['並べ替え', '並べ替え', 'ならべかえ', 'sort', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['注目順', '注目順', 'ちゅうもくじゅん', 'hot', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['新しい順', '新しい順', 'あたらしいじゅん', 'new', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['賛成票数順', '賛成票数順', 'さんせいひょうすうじゅん', 'most votes', ['noun'], 100, ['not-in-deck'], ['LHHHHHH']],
    ['告知', '告知', 'こくち', 'announcement', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['賛成票', '賛成票', 'さんせいひょう', 'upvote', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['コメント', 'コメント', 'コメント', 'comment', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['時間', '時間', 'じかん', 'hour', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['前', '前', 'まえ', 'ago', ['noun'], 100, ['not-in-deck'], ['LH']],
    ['共有', '共有', 'きょうゆう', 'share', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['国際', '国際', 'こくさい', 'international', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['カップル', 'カップル', 'カップル', 'couple', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['恋愛', '恋愛', 'れんあい', 'romance', ['noun'], 100, ['not-in-deck'], ['LHH']],
    // Deliberately malformed parser outputs: valid offsets but non-Japanese
    // source slices. The renderer must discard both at its final boundary.
    ['r/singularity', '日本語', 'にほんご', 'invalid Latin token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['…', '日本語', 'にほんご', 'invalid punctuation token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
];

const settings = createReaderSmokeSettings({
    preferJapaneseSiteLanguage: false,
    showFloatingButton: true,
});

const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reddit iPad Annotation Regression</title>
<style>
html, body { margin: 0; min-height: 100%; background: #0b1416; color: #f2f4f5; font: 16px/1.25 system-ui, sans-serif; }
body { display: grid; place-items: start center; }
/* Reproduce Reddit's broad tablet control rules hitting body-mounted Yomu UI.
   Inline-priority isolation must win without changing Reddit's own layout. */
body > button, body > [role="menu"] { zoom: 1.6 !important; }
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
.foreign-stack { margin-top: 12px; }
.foreign-row { box-sizing: border-box; height: 28px; font: 600 28px/28px system-ui, sans-serif; white-space: nowrap; }
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
    <div id="foreign-stack" class="foreign-stack" role="menu"><div class="foreign-row">Sort mode</div><div id="foreign-jp" class="foreign-row" role="menuitem">共有</div></div>
    <div class="feed-tools"><span>フィード</span><reddit-sort-control id="sort-shell"></reddit-sort-control></div>
    <reddit-clipped-title></reddit-clipped-title>
    <a id="highlight-card" class="highlight-card" href="#highlight">
      <h2>Discord Server Link</h2>
      <span id="flair" class="card-row">告知</span>
      <span id="card-metadata" class="card-row">10件の賛成票・0件のコメント</span>
    </a>
    <article id="post" class="post">
      <div class="post-meta"><span>u/ResultBackground2470・</span><time id="post-meta" datetime="2026-07-10T19:01:00Z">2 時間前</time></div>
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
    root.innerHTML = '<style>button{box-sizing:border-box;display:inline-block;height:40px;max-height:40px;overflow:hidden;padding:13px 18px;border:1px solid #748087;border-radius:999px;background:#0b1416;color:#f2f4f5;font:600 16px/14px system-ui;white-space:nowrap}</style><button id="join" type="button">参加</button>';
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
    root.innerHTML = '<style>:host{position:relative}.menu{position:absolute;inset-inline-end:0;z-index:3;width:320px;padding:8px 14px;background:#111a1d;border:1px solid #343d42;border-radius:14px}button{box-sizing:border-box;height:40px;max-height:40px;overflow:hidden;padding:0 12px;border:0;background:#0b1416;color:#b7c2c8;font:600 14px/20px system-ui;white-space:nowrap}.menu[hidden]{display:none}.menu-heading,.menu-option{box-sizing:border-box;height:28px;font:600 28px/28px system-ui;white-space:nowrap}</style><button id="sort" type="button" aria-haspopup="menu" aria-expanded="false">賛成票率順⌄</button><div id="sort-menu" class="menu" role="menu" hidden><div id="menu-heading" class="menu-heading">並べ替え</div><div id="menu-hot" class="menu-option" role="menuitem">注目順</div><div id="menu-new" class="menu-option" role="menuitem">新しい順</div><div id="menu-votes" class="menu-option" role="menuitem">賛成票数順</div></div>';
    root.getElementById('sort').addEventListener('click', () => {
      window.__redditSmokeClicks.sort += 1;
      root.getElementById('sort-menu').hidden = false;
      root.getElementById('sort').setAttribute('aria-expanded', 'true');
    });
  }
}
customElements.define('reddit-sort-control', RedditSortControl);
class RedditClippedTitle extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>#clipped-reader-row{box-sizing:border-box;display:block;width:180px;height:44px;max-height:44px;overflow:hidden;color:#f2f4f5;font:600 16px/22px system-ui;white-space:pre-wrap}</style><span id="clipped-reader-row">#国際カップル #国際恋愛 #カップル</span>';
  }
}
customElements.define('reddit-clipped-title', RedditClippedTitle);
</script>
</body>
</html>`;

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const summaries = [];
const failures = [];
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
        hasTouch: true,
        isMobile: true,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    try {
        await page.route(`https://www.reddit.com${PAGE_PATH}*`, route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: PAGE,
        }));
        await installUserscriptFixtureBridge(page, {
            requestBridgeName: REQUEST_BRIDGE,
            requestHandler: request => mockedYomuRequest(request, requests),
            settings,
            css: readFileSync(CSS_PATH, 'utf8'),
        });
        await page.goto(`https://www.reddit.com${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        const baseline = await page.evaluate(snapshotRedditLayout);
        await page.addStyleTag({ path: CSS_PATH });
        await page.addScriptTag({ path: SCRIPT_PATH });

        await Promise.all([
            page.locator('#create-post .jpdb-reader-word').nth(1).waitFor({ timeout: 20_000 }),
            page.locator('#card-metadata .jpdb-reader-word').nth(1).waitFor({ timeout: 20_000 }),
            page.locator('#share .jpdb-reader-word').waitFor({ timeout: 20_000 }),
            page.locator('#join .jpdb-reader-word').waitFor({ timeout: 20_000 }),
            page.locator('#sort .jpdb-reader-word').waitFor({ timeout: 20_000 }),
            page.locator('#clipped-reader-row .jpdb-reader-additive-text-mirror').waitFor({ timeout: 20_000, state: 'attached' }),
            page.locator('.jpdb-reader-fab').waitFor({ timeout: 20_000 }),
        ]);
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
        await page.locator('#menu-heading .jpdb-reader-word').waitFor({ timeout: 20_000 });
        await page.locator('#menu-votes .jpdb-reader-word').waitFor({ timeout: 20_000 });
        // Dispatch through the control itself: Chromium's synthetic hit-test
        // does not compensate an ancestor zoom the same way WebKit does, while
        // the product contract here is rendered geometry (ordinary control
        // click-through is covered above and in the floating-button unit suite).
        await page.locator('.jpdb-reader-fab').evaluate(button => button.click());
        await page.locator('.jpdb-reader-fab-radial.is-open').waitFor({ timeout: 5_000 });
        await page.waitForTimeout(400);

        const snapshot = await snapshotRedditRegression(page);
        const touchHover = await snapshotTouchHoverSafety(page);
        const screenshot = path.join(ARTIFACTS, `reddit-chrome-furigana-smoke-${engineName}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        assertRedditRegression(engineName, baseline, snapshot, touchHover, pageErrors);
        const mirrorRemovalFallback = await page.evaluate(() => {
            const join = document.querySelector('reddit-header-shell').shadowRoot
                .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
            join.querySelector('.jpdb-reader-text-mirror')?.remove();
            const style = getComputedStyle(join);
            return {
                text: join.textContent.trim(),
                visibility: style.visibility,
                color: style.color,
                fill: style.webkitTextFillColor,
                width: join.getBoundingClientRect().width,
            };
        });
        assert(mirrorRemovalFallback.text.includes('参加')
            && mirrorRemovalFallback.visibility !== 'hidden'
            && mirrorRemovalFallback.color !== 'transparent'
            && mirrorRemovalFallback.color !== 'rgba(0, 0, 0, 0)'
            && mirrorRemovalFallback.width > 0,
        `${engineName}: removing a framework mirror left a blank control`, mirrorRemovalFallback);
        return { engine: engineName, screenshot, requests: requests.length, baseline, touchHover, mirrorRemovalFallback, ...snapshot };
    } finally {
        await context.close().catch(() => undefined);
    }
}

function mockedYomuRequest(request, requestLog) {
    return mockJpdbApiRequest(request, requestLog, VOCABULARY, {
        logUnexpected: true,
        unmatchedResponse: { status: 404, responseText: '' },
    });
}

function snapshotRedditLayout() {
    const card = document.querySelector('#highlight-card').getBoundingClientRect();
    const post = document.querySelector('#post').getBoundingClientRect();
    const join = document.querySelector('reddit-header-shell').shadowRoot
        .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
    const sort = document.querySelector('reddit-sort-control').shadowRoot.querySelector('#sort');
    return {
        createHeight: document.querySelector('#create-post').getBoundingClientRect().height,
        shareHeight: document.querySelector('#share').getBoundingClientRect().height,
        cardHeight: card.height,
        cardToPostGap: post.top - card.bottom,
        joinTextCenterOffset: nativeTextCenterOffset(join),
        sortTextCenterOffset: nativeTextCenterOffset(sort),
    };

    function nativeTextCenterOffset(element) {
        const node = [...element.childNodes].find(child => child.nodeType === Node.TEXT_NODE && child.data.trim());
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return (text.top + text.bottom - box.top - box.bottom) / 2;
    }
}

async function snapshotRedditRegression(page) {
    const specs = {
        create: ['#create-post', '投稿を作成'],
        join: ['#join', '参加'],
        sort: ['#sort', '賛成票率順'],
        flair: ['#flair', '告知'],
        metadata: ['#card-metadata', '賛成票・コメント'],
        time: ['#post-meta', '時間前'],
        share: ['#share', '共有'],
        foreign: ['#foreign-jp', '共有'],
        menuHeading: ['#menu-heading', '並べ替え'],
        menuHot: ['#menu-hot', '注目順'],
        menuNew: ['#menu-new', '新しい順'],
        menuVotes: ['#menu-votes', '賛成票数順'],
    };
    const labelEntries = await Promise.all(Object.entries(specs).map(async ([name, [selector, expected]]) => [
        name,
        await page.locator(selector).evaluate(snapshotRedditElement, expected),
    ]));
    const [subreddit, punctuation, summary, menuSafety] = await Promise.all([
        page.locator('#subreddit').evaluate(snapshotRedditElement, null),
        page.locator('#punctuation').evaluate(snapshotRedditElement, null),
        page.evaluate(snapshotRedditPageSummary),
        page.locator('reddit-sort-control').evaluate(snapshotSortMenuSafety),
    ]);
    return {
        labels: Object.fromEntries(labelEntries),
        rejected: {
            subredditWords: subreddit.wordCount,
            punctuationWords: punctuation.wordCount,
            subredditText: subreddit.visibleText,
            punctuationText: punctuation.visibleText,
        },
        menuSafety,
        ...summary,
    };
}

function snapshotRedditElement(element, expected) {
    const rect = element.getBoundingClientRect();
    const words = [...element.querySelectorAll('.jpdb-reader-word')];
    const mirrors = [...element.querySelectorAll(':scope > .jpdb-reader-text-mirror')]
        .filter(mirror => getComputedStyle(mirror).visibility !== 'hidden');
    const clone = (mirrors[0] ?? element).cloneNode(true);
    clone.querySelectorAll('.jpdb-reader-text-mirror,.jpdb-reader-furi,rt,rp').forEach(node => node.remove());
    const visibleText = String(clone.textContent)
        .replace(/\s+/g, ' ')
        .trim();
    const visibleWords = words.map(word => {
        const wordRect = word.getBoundingClientRect();
        const style = getComputedStyle(word);
        return [style.visibility !== 'hidden', style.opacity !== '0', wordRect.width > 0, wordRect.height > 0].every(Boolean);
    }).every(Boolean);
    const readings = [...element.querySelectorAll('rt,.jpdb-reader-detached-furi')];
    const visibleReadings = readings.filter(reading => {
        const style = getComputedStyle(reading);
        const box = reading.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    });
    return {
        expected,
        visibleText,
        height: rect.height,
        wordCount: words.length,
        pitchWordCount: words.filter(word => Boolean(word.dataset.pitchClass && word.dataset.pitchClass !== 'unknown')).length,
        expressions: words.map(word => word.getAttribute('data-expression')),
        readingCount: readings.length,
        visibleReadingCount: visibleReadings.length,
        hiddenReadingCount: readings.length - visibleReadings.length,
        readingTexts: readings.map(reading => reading.textContent ?? ''),
        nativeRubyCount: element.querySelectorAll('rt').length,
        readingClipped: readings.some(readingIsClipped),
        readingClipAncestors: readings.flatMap(readingClipAncestors),
        readingBaseOverlap: readingBaseOverlap(element),
        readingStyles: readings.map(reading => ({
            lift: reading.style.getPropertyValue('--jpdb-reader-detached-lift'),
            marginLeft: reading.style.marginLeft,
            transform: getComputedStyle(reading).transform,
            rect: reading.getBoundingClientRect().toJSON(),
        })),
        overflow: getComputedStyle(element).overflow,
        inlineOverflow: element.style.getPropertyValue('overflow'),
        detachedOverflowStamp: element.dataset.yomuDetachedReadingOverflow ?? '',
        client: [element.clientWidth, element.clientHeight],
        scroll: [element.scrollWidth, element.scrollHeight],
        rubyRoomCount: element.querySelectorAll('[data-yomu-ruby-room]').length
            + Number(element.hasAttribute('data-yomu-ruby-room')),
        visibleWords,
        wordCenterOffset: words.length ? wordUnionCenter(words) - (rect.top + rect.bottom) / 2 : null,
    };

    function wordUnionCenter(wordElements) {
        const rects = wordElements.map(word => word.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
        return rects.length ? (Math.min(...rects.map(box => box.top)) + Math.max(...rects.map(box => box.bottom))) / 2 : 0;
    }


    function readingIsClipped(reading) {
        const readingRect = reading.getBoundingClientRect();
        if (readingRect.width <= 0 || readingRect.height <= 0) return false;
        for (let ancestor = reading.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (![style.overflow, style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip')) continue;
            const box = ancestor.getBoundingClientRect();
            if (readingRect.top < box.top - 0.5 || readingRect.bottom > box.bottom + 0.5
                || readingRect.left < box.left - 0.5 || readingRect.right > box.right + 0.5) return true;
        }
        return false;
    }

    function readingClipAncestors(reading) {
        const readingRect = reading.getBoundingClientRect();
        if (readingRect.width <= 0 || readingRect.height <= 0) return [];
        const clipped = [];
        for (let ancestor = reading.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            if (![style.overflow, style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip')) continue;
            const box = ancestor.getBoundingClientRect();
            if (readingRect.top < box.top - 0.5 || readingRect.bottom > box.bottom + 0.5
                || readingRect.left < box.left - 0.5 || readingRect.right > box.right + 0.5) {
                clipped.push(ancestor.id || ancestor.className || ancestor.tagName);
            }
        }
        return clipped;
    }

    function readingBaseOverlap(root) {
        const bases = [...root.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.getBoundingClientRect());
        let overlaps = 0;
        for (const reading of root.querySelectorAll('rt,.jpdb-reader-detached-furi')) {
            const r = reading.getBoundingClientRect();
            for (const b of bases) {
                if (Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.5
                    && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.5) overlaps += 1;
            }
        }
        return overlaps;
    }
}

function snapshotSortMenuSafety(host) {
    const menu = host.shadowRoot.querySelector('#sort-menu');
    const readings = [...menu.querySelectorAll('.jpdb-reader-detached-furi')];
    const visible = readings.filter(reading => {
        const style = getComputedStyle(reading);
        const rect = reading.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const bases = [...menu.querySelectorAll('.jpdb-reader-ruby-base')]
        .filter(base => getComputedStyle(base).visibility !== 'hidden');
    let readingBaseOverlap = 0;
    let readingReadingOverlap = 0;
    for (const reading of visible) {
        const readingRect = reading.getBoundingClientRect();
        for (const base of bases) {
            if (rectanglesOverlap(readingRect, base.getBoundingClientRect())) readingBaseOverlap += 1;
        }
    }
    for (let index = 0; index < visible.length; index += 1) {
        for (let other = index + 1; other < visible.length; other += 1) {
            if (rectanglesOverlap(visible[index].getBoundingClientRect(), visible[other].getBoundingClientRect())) {
                readingReadingOverlap += 1;
            }
        }
    }
    const hidden = readings.filter(reading => !visible.includes(reading));
    return {
        wordCount: menu.querySelectorAll('.jpdb-reader-word').length,
        readingCount: readings.length,
        visibleReadingCount: visible.length,
        hiddenReadingCount: hidden.length,
        hiddenReadingsKeepWord: hidden.every(reading => Boolean(reading.closest('.jpdb-reader-word'))),
        hiddenReadingsKeepPitch: hidden.every(reading => Boolean(reading.closest('.jpdb-reader-word')?.dataset.pitchClass)),
        readingTexts: readings.map(reading => reading.textContent ?? ''),
        readingBaseOverlap,
        readingReadingOverlap,
    };

    function rectanglesOverlap(left, right) {
        return Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5
            && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
    }
}

async function snapshotTouchHoverSafety(page) {
    const host = page.locator('#clipped-reader-row');
    const mirror = host.locator('.jpdb-reader-text-mirror');
    const before = await host.evaluate(touchHoverState);
    await host.hover({ force: true });
    const hovered = await host.evaluate(touchHoverState);
    await page.mouse.move(0, 0);
    const after = await host.evaluate(touchHoverState);
    return {
        mirrorWords: await mirror.locator('.jpdb-reader-word').count(),
        mirrorPitchWords: await mirror.locator('.jpdb-reader-word[data-pitch-class]').count(),
        mirrorRuby: await mirror.locator('rt,.jpdb-reader-detached-furi').count(),
        before,
        hovered,
        after,
    };
}

function touchHoverState(element) {
    const mirror = element.querySelector('.jpdb-reader-text-mirror');
    const style = getComputedStyle(element);
    const readings = mirror ? [...mirror.querySelectorAll('rt,.jpdb-reader-detached-furi')] : [];
    const paintIsVisible = value => value !== 'transparent'
        && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)
        && !/\/\s*0(?:\.0+)?%?\s*\)$/.test(value);
    const bases = mirror ? [...mirror.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.getBoundingClientRect()) : [];
    const readingBaseOverlap = readings.reduce((count, reading) => {
        const r = reading.getBoundingClientRect();
        return count + bases.filter(b => Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.5
            && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.5).length;
    }, 0);
    return {
        height: element.getBoundingClientRect().height,
        mirrorVisibility: mirror ? getComputedStyle(mirror).visibility : '',
        visibleRuby: readings.filter(reading => getComputedStyle(reading).display !== 'none' && getComputedStyle(reading).visibility !== 'hidden').length,
        detachedReadings: mirror?.querySelectorAll('.jpdb-reader-detached-furi').length ?? 0,
        safetyHiddenReadings: readings.filter(reading => reading.dataset.yomuDetachedReadingHidden === 'unsafe-lane').length,
        readingBaseOverlap,
        wordWhiteSpace: mirror?.querySelector('.jpdb-reader-word') ? getComputedStyle(mirror.querySelector('.jpdb-reader-word')).whiteSpace : '',
        mirrorClientWidth: mirror?.clientWidth ?? 0,
        mirrorScrollWidth: mirror?.scrollWidth ?? 0,
        hostVisibility: style.visibility,
        hostPaintVisible: paintIsVisible(style.color) || paintIsVisible(style.webkitTextFillColor),
        color: style.color,
        fill: style.webkitTextFillColor,
    };
}

function snapshotRedditPageSummary() {
    const card = document.querySelector('#highlight-card').getBoundingClientRect();
    const post = document.querySelector('#post').getBoundingClientRect();
    const puck = document.querySelector('.jpdb-reader-fab');
    const puckRect = puck.getBoundingClientRect();
    const radialItems = [...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
    const radialRects = radialItems.map(item => item.getBoundingClientRect());
    const radialCenters = radialRects.map(rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    return {
        layout: {
            createHeight: document.querySelector('#create-post').getBoundingClientRect().height,
            shareHeight: document.querySelector('#share').getBoundingClientRect().height,
            cardHeight: card.height,
            cardToPostGap: post.top - card.bottom,
            viewportWidth: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            rubyRoomCount: document.querySelectorAll('[data-yomu-ruby-room]').length,
        },
        overlay: {
            hostname: location.hostname,
            bodyZoom: getComputedStyle(document.body).zoom,
            puckZoom: getComputedStyle(puck).zoom,
            puckWidth: puckRect.width,
            puckHeight: puckRect.height,
            radialWidths: radialRects.map(rect => rect.width),
            adjacentDistances: radialCenters.slice(1).map((center, index) => Math.hypot(
                center.x - radialCenters[index].x,
                center.y - radialCenters[index].y,
            )),
        },
        clicks: window.__redditSmokeClicks,
    };
}

function assertRedditRegression(engineName, baseline, snapshot, touchHover, pageErrors) {
    assert(pageErrors.length === 0, `${engineName}: page errors during Reddit smoke`, { pageErrors, snapshot });
    assert(snapshot.overlay.hostname === 'www.reddit.com', `${engineName}: Reddit scale fixture lost its production hostname`, snapshot.overlay);
    // The open hub deliberately grows to 1.06×; the host's 1.6× zoom must not
    // multiply that again (52 × 1.06 = 55.12px).
    assert(Math.abs(snapshot.overlay.puckWidth - 55.12) <= 1 && Math.abs(snapshot.overlay.puckHeight - 55.12) <= 1,
        `${engineName}: Reddit host zoom enlarged the Yomu puck`, snapshot.overlay);
    assert(snapshot.overlay.radialWidths.length >= 6
        && snapshot.overlay.radialWidths.every(width => width >= 45 && width <= 51),
    `${engineName}: Reddit host zoom enlarged the Yomu radial controls`, snapshot.overlay);
    assert(Math.min(...snapshot.overlay.adjacentDistances) >= 60,
        `${engineName}: Reddit scale isolation collapsed radial finger spacing`, snapshot.overlay);
    for (const [name, label] of Object.entries(snapshot.labels)) {
        assert(label.wordCount > 0, `${engineName}: ${name} was not annotated`, label);
        assert(label.readingCount > 0, `${engineName}: ${name} is missing furigana`, label);
        assert(label.nativeRubyCount === 0, `${engineName}: ${name} gained layout-changing native ruby`, label);
        assert(label.readingClipped === false, `${engineName}: ${name} furigana is clipped`, label);
        assert(label.readingBaseOverlap === 0, `${engineName}: ${name} furigana overlaps base text`, label);
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
    assert(snapshot.menuSafety.wordCount >= 4, `${engineName}: dynamically revealed shadow menu was not annotated`, snapshot.menuSafety);
    assert(snapshot.menuSafety.hiddenReadingCount > 0, `${engineName}: tight menu did not exercise the no-safe-lane fallback`, snapshot.menuSafety);
    assert(snapshot.menuSafety.hiddenReadingsKeepWord && snapshot.menuSafety.hiddenReadingsKeepPitch,
        `${engineName}: hiding unsafe furigana removed the word or pitch annotation`, snapshot.menuSafety);
    assert(snapshot.menuSafety.readingBaseOverlap === 0 && snapshot.menuSafety.readingReadingOverlap === 0,
        `${engineName}: visible menu furigana overlaps another reading or base line`, snapshot.menuSafety);
    assert(snapshot.menuSafety.readingTexts.every(text => text && !text.includes('…') && !text.includes('...')),
        `${engineName}: unsafe furigana was truncated instead of preserved in full`, snapshot.menuSafety);
    assert(snapshot.labels.foreign.hiddenReadingCount > 0,
        `${engineName}: furigana covered an ordinary unannotated line above it`, snapshot.labels.foreign);
    assert(snapshot.labels.foreign.pitchWordCount > 0,
        `${engineName}: hiding furigana from the foreign-text collision removed pitch annotation`, snapshot.labels.foreign);
    assert(Object.values(snapshot.clicks).every(count => count === 1), `${engineName}: an annotated control stopped receiving clicks`, snapshot.clicks);
    assert(Math.abs(snapshot.labels.join.wordCenterOffset - baseline.joinTextCenterOffset) <= 2,
        `${engineName}: mirrored Join label moved away from its native vertical alignment`, { baseline, join: snapshot.labels.join });
    assert(Math.abs(snapshot.labels.sort.wordCenterOffset - baseline.sortTextCenterOffset) <= 2,
        `${engineName}: mirrored sort label moved away from its native vertical alignment`, { baseline, sort: snapshot.labels.sort });
    assert(touchHover.mirrorWords > 0 && touchHover.mirrorPitchWords > 0 && touchHover.mirrorRuby > 0,
        `${engineName}: touch fixture did not retain its annotated mirror`, touchHover);
    assert(touchHover.before.mirrorVisibility === 'visible' && touchHover.hovered.mirrorVisibility === 'visible',
        `${engineName}: coarse-pointer annotations still depend on a sticky hover transition`, touchHover);
    assert(touchHover.before.detachedReadings > 0
        && touchHover.before.visibleRuby + touchHover.before.safetyHiddenReadings === touchHover.before.detachedReadings
        && touchHover.hovered.visibleRuby + touchHover.hovered.safetyHiddenReadings === touchHover.hovered.detachedReadings
        && touchHover.after.visibleRuby + touchHover.after.safetyHiddenReadings === touchHover.after.detachedReadings,
    `${engineName}: coarse-pointer mirror lost detached readings without a safety verdict`, touchHover);
    assert(touchHover.hovered.visibleRuby === touchHover.before.visibleRuby
        && touchHover.after.visibleRuby === touchHover.before.visibleRuby,
    `${engineName}: coarse-pointer detached readings changed across sticky hover`, touchHover);
    assert(touchHover.before.readingBaseOverlap === 0 && touchHover.hovered.readingBaseOverlap === 0,
        `${engineName}: coarse-pointer furigana overlaps base text`, touchHover);
    assert(touchHover.before.hostVisibility !== 'hidden' && touchHover.hovered.hostVisibility !== 'hidden'
        && touchHover.after.hostVisibility !== 'hidden'
        && touchHover.before.hostPaintVisible && touchHover.hovered.hostPaintVisible && touchHover.after.hostPaintVisible,
        `${engineName}: additive mirror hid the native fallback text`, touchHover);
    assert(Math.abs(touchHover.hovered.height - touchHover.before.height) <= 1
        && Math.abs(touchHover.after.height - touchHover.before.height) <= 1,
    `${engineName}: coarse-pointer hover changed row geometry`, touchHover);
}
