#!/usr/bin/env node
// iPad-shaped Reddit annotation regression smoke.
//
// This is a deterministic routed fixture, not visual proof from reddit.com.
// It reproduces the structural facts observed on the live site:
//   - WebKit's 760px browser surface over a 475px layout viewport (1.6×);
//   - a Join button two open-shadow boundaries below a Latin-only shell;
//   - an Award button whose sole painted label is aria-hidden inside its open
//     shadow root while the button repeats that label as its accessible name;
//   - fixed-height header/sort/share controls;
//   - a fixed card with 14-16px Japanese flair and vote/comment metadata;
//   - Latin-only and punctuation-only source ranges returned as bogus tokens.
//
// The contract is visible annotation without geometry-changing ruby in controls
// or compact metadata. Base text stays visible, buttons remain clickable, cards
// do not grow, and only source ranges that actually contain Japanese are painted.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    assert,
    assertBuiltArtifacts,
    createReaderSmokeSettings,
    createSmokePaths,
    installUserscriptFixtureBridge,
    launchOptionalBrowser,
    mockJpdbApiRequest,
    requestedBrowserCoverageFailures,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const playwrightModule = await import(process.env.YOMU_REDDIT_PLAYWRIGHT_MODULE
    ? pathToFileURL(path.resolve(process.env.YOMU_REDDIT_PLAYWRIGHT_MODULE)).href
    : 'playwright');
const { chromium, webkit } = playwrightModule;

const REQUEST_BRIDGE = '__yomuRedditChromeRequest';
const TRUSTED_SETTINGS_OPEN_BRIDGE = '__yomuRedditChromeSettingsOpen';
const PAGE_PATH = '/reddit-ipad-annotation-regression.html';
const TRUSTED_SETTINGS_URL = 'https://yomureader.com/study/#settings=appearance';
const LANGUAGE_PROFILE_ID = 'reddit-chrome-smoke';
const smokePaths = createSmokePaths(import.meta.dirname);
const ROOT = smokePaths.root;
const ARTIFACTS = smokePaths.artifacts;
const SCRIPT_PATH = path.resolve(process.env.YOMU_REDDIT_SMOKE_USERSCRIPT ?? smokePaths.scriptPath);
const CSS_PATH = path.resolve(process.env.YOMU_REDDIT_SMOKE_CSS ?? smokePaths.cssPath);

// Every fixture label is annotated at rest, chrome and content alike — buttons
// (create/join/sort/share and their shadow-DOM twins), menu items, flair,
// metadata, timestamps and foreign chips all take the same path. Controls stay
// safe because their readings ride an out-of-flow lane that cannot change the
// control's line height, hit target, or clipping, which the geometry assertions
// below enforce — not because anything is hidden until hover.
const REQUIRED_COMPANION_PATHS = userscriptCompanionPaths(SCRIPT_PATH);
// Browser DOMRects include the font line box. Directly stacked reading/base
// glyphs can therefore report up to 3px of contact without visibly overlapping.
const MAX_FONT_BOX_CONTACT_PX = 3.5;

const VOCABULARY = [
    ['投稿', '投稿', 'とうこう', 'post', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['作成', '作成', 'さくせい', 'create', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['参加', '参加', 'さんか', 'join', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['フィード', 'フィード', 'フィード', 'feed', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    // Match the public parser's real compound boundaries. Whole-compound mock
    // rows hid partial hydration because each control appeared to be one card.
    ['並べ替え', '並べ替え', 'ならべかえ', 'sort', ['verb'], 100, ['not-in-deck'], ['LHHHHH']],
    ['基準', '基準', 'きじゅん', 'criterion', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['注目順', '注目順', 'ちゅうもくじゅん', 'hot', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['新しい順', '新しい順', 'あたらしいじゅん', 'new', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['賛成票数順', '賛成票数順', 'さんせいひょうすうじゅん', 'most votes', ['noun'], 100, ['not-in-deck'], ['LHHHHHH']],
    ['告知', '告知', 'こくち', 'announcement', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['賛成票', '賛成票', 'さんせいひょう', 'upvote', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['率', '率', 'りつ', 'rate', ['noun'], 100, ['not-in-deck'], ['HL']],
    ['順', '順', 'じゅん', 'order', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['コメント', 'コメント', 'コメント', 'comment', ['noun'], 100, ['not-in-deck'], ['LHHHH']],
    ['時間', '時間', 'じかん', 'hour', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['前', '前', 'まえ', 'ago', ['noun'], 100, ['not-in-deck'], ['LH']],
    ['共有', '共有', 'きょうゆう', 'share', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['アワード', 'アワード', 'アワード', 'award', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['贈る', '贈る', 'おくる', 'give', ['verb'], 100, ['not-in-deck'], ['LHH']],
    ['国際', '国際', 'こくさい', 'international', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['カップル', 'カップル', 'カップル', 'couple', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['恋愛', '恋愛', 'れんあい', 'romance', ['noun'], 100, ['not-in-deck'], ['LHH']],
    ['続ける', '続ける', 'つづける', 'continue', ['verb'], 100, ['not-in-deck'], ['LHHH']],
    // Deliberately malformed parser outputs: valid offsets but non-Japanese
    // source slices. The renderer must discard both at its final boundary.
    ['r/singularity', '日本語', 'にほんご', 'invalid Latin token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
    ['…', '日本語', 'にほんご', 'invalid punctuation token', ['noun'], 100, ['not-in-deck'], ['LHHH']],
];
const MOCK_PITCH_EXPRESSIONS = new Set(VOCABULARY
    .filter(entry => Array.isArray(entry[7]) && entry[7].length > 0)
    .map(entry => entry[0]));

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
    preferJapaneseSiteLanguage: false,
    showFloatingButton: true,
    popupMode: 'popover',
    popoverWidth: 520,
});

const IPAD_SAFARI_UA = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const PAGE = `<!doctype html>
<html lang="ja" data-yomu-fixture="deterministic-reddit-structure">
<head>
<meta charset="utf-8">
<meta name="viewport" content="__VIEWPORT_CONTENT__">
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
.foreign-stack { margin-top: 12px; }
.foreign-row { box-sizing: border-box; height: 28px; font: 600 28px/28px system-ui, sans-serif; white-space: nowrap; }
#popup-anchor {
  position: fixed; right: 18px; bottom: 112px; z-index: 2;
  box-sizing: border-box; padding: 8px 12px; border: 1px solid #748087; border-radius: 10px;
  background: #172126; color: #f2f4f5; font: 600 18px/24px system-ui, sans-serif;
}
#late-localizing-signin {
  position: absolute; inset: auto 18px 18px auto; width: 260px; height: 64px; border: 0;
}
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
    <div class="feed-tools"><reddit-feed-control id="feed-shell"></reddit-feed-control><reddit-sort-control id="sort-shell"></reddit-sort-control></div>
    <reddit-clipped-title></reddit-clipped-title>
    <a id="highlight-card" class="highlight-card" href="#highlight">
      <h2>Discord Server Link</h2>
      <span id="flair" class="card-row">告知</span>
      <span id="card-metadata" class="card-row">10件の賛成票・0件のコメント</span>
    </a>
    <article id="post" class="post">
      <div class="post-meta"><span>u/ResultBackground2470・</span><time id="post-meta" datetime="2026-07-10T19:01:00Z">2 時間前</time></div>
      <h2>GPT Solves Yet Another Problem</h2>
      <div class="post-actions"><reddit-award-button></reddit-award-button><button id="share" class="safe-control" type="button">共有</button></div>
    </article>
    <span id="popup-anchor">投稿</span>
    <iframe id="late-localizing-signin" name="late-localizing-signin"
      srcdoc="<!doctype html><html lang='en'><head><meta charset='utf-8'><style>body{margin:0;padding:8px;background:#0b1416}button{box-sizing:border-box;width:240px;height:44px;border:1px solid #748087;border-radius:999px;background:#eef0f2;color:#182026;font:600 16px/20px system-ui}</style></head><body><button id='google-signin'>Continue with Google</button></body></html>"></iframe>
  </main>
</shreddit-app>
<script>
window.__redditSmokeClicks = { create: 0, join: 0, sort: 0, award: 0, share: 0 };
document.getElementById('create-post').addEventListener('click', () => { window.__redditSmokeClicks.create += 1; });
document.getElementById('share').addEventListener('click', () => { window.__redditSmokeClicks.share += 1; });
class RedditJoinControl extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{box-sizing:border-box;display:inline-block;height:40px;max-height:40px;overflow:hidden;padding:13px 18px;border:1px solid #748087;border-radius:999px;background:#0b1416;color:#f2f4f5;font:600 16px/14px system-ui;white-space:nowrap}</style><button id="join" type="button">Join</button>';
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
class RedditAwardButton extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{box-sizing:border-box;display:inline-flex;align-items:center;height:40px;max-height:40px;overflow:visible;padding:0 10px;border:1px solid #748087;border-radius:999px;background:#0b1416;color:#f2f4f5;font:600 13px/18px system-ui;white-space:nowrap}</style><button id="award-control" type="button" aria-label="アワードを贈る"><span aria-hidden="true"></span><span><span data-award-initial-text aria-hidden="true">アワードを贈る</span></span></button>';
    root.getElementById('award-control').addEventListener('click', () => { window.__redditSmokeClicks.award += 1; });
  }
}
customElements.define('reddit-award-button', RedditAwardButton);
class RedditFeedControl extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<span id="feed">Feed</span>';
  }
}
customElements.define('reddit-feed-control', RedditFeedControl);
class RedditSortControl extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{position:relative}.menu{position:absolute;inset-inline-end:0;z-index:3;width:320px;padding:8px 14px;background:#111a1d;border:1px solid #343d42;border-radius:14px}button{box-sizing:border-box;height:40px;max-height:40px;overflow:hidden;padding:0 12px;border:0;background:#0b1416;color:#b7c2c8;font:600 14px/20px system-ui;white-space:nowrap}.menu[hidden]{display:none}.menu-heading,.menu-option{box-sizing:border-box;height:56px;padding-top:20px;font:600 28px/28px system-ui;white-space:nowrap}</style><button id="sort" type="button" aria-haspopup="menu" aria-expanded="false">Sort⌄</button><div id="sort-menu" class="menu" role="menu" hidden><div id="menu-heading" class="menu-heading">Sort criterion</div><div id="menu-hot" class="menu-option" role="menuitem">Hot</div><div id="menu-new" class="menu-option" role="menuitem">New</div><div id="menu-votes" class="menu-option" role="menuitem">Most votes</div></div>';
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
// Generic composed-DOM discovery regression fixture (not a live Reddit
// capture): these two hosts are appended to the page AFTER Yomu has already
// booted, reproducing the two shapes a document MutationObserver cannot see
// on its own — an added host whose OPEN shadow root is ALREADY populated with
// Japanese, and an added host with an initially empty OPEN shadow root that
// hydrates Japanese later with no light-DOM mutation at all.
class RedditLateJoinHost extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<button id="late-join" type="button">参加</button>';
  }
}
customElements.define('reddit-late-join-host', RedditLateJoinHost);
class RedditLateHydrateHost extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  connectedCallback() {
    setTimeout(() => {
      this.shadowRoot.innerHTML = '<button id="late-hydrate" type="button">フィード</button>';
    }, 100);
  }
}
customElements.define('reddit-late-hydrate-host', RedditLateHydrateHost);
</script>
</body>
</html>`;

mkdirSync(ARTIFACTS, { recursive: true });
assert(REQUIRED_COMPANION_PATHS.length > 0, 'Built userscript has no local companion fixtures to load');
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...REQUIRED_COMPANION_PATHS], ROOT, 'Run npm run build first.');

const summaries = [];
const failures = [];
const requestedEngines = new Set(
    (process.env.YOMU_REDDIT_SMOKE_ENGINES ?? 'chromium,webkit')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
);
for (const engine of [{ name: 'chromium', type: chromium }, { name: 'webkit', type: webkit }]
    .filter(engine => requestedEngines.has(engine.name))) {
    const launched = await launchOptionalBrowser(engine.type, engine.name, { headless: true });
    if (launched.skipped) {
        summaries.push({ engine: engine.name, skipped: true, reason: launched.reason });
        continue;
    }
    try {
        summaries.push(await runEngine(engine.name, launched.browser));
    } catch (error) {
        const firstFailure = String(error);
        if (!isRetryablePerformanceFailure(firstFailure)) {
            failures.push(`${engine.name}: ${firstFailure.slice(0, 8000)}`);
            continue;
        }

        // Shared CI runners can be descheduled for hundreds of milliseconds
        // even when the page is idle. Preserve the strict frame/input limits,
        // but require a fresh browser context to fail them twice before calling
        // it reader work. The first sample stays in the summary for diagnosis.
        try {
            const retry = await runEngine(engine.name, launched.browser);
            console.warn(
                `${engine.name}: performance gate passed on a clean-context retry; first sample is preserved in the JSON summary`,
            );
            summaries.push({
                ...retry,
                performanceRetry: {
                    firstFailure: firstFailure.slice(0, 2000),
                },
            });
        } catch (retryError) {
            const retryFailure = String(retryError);
            failures.push([
                isRetryablePerformanceFailure(retryFailure)
                    ? `${engine.name}: performance gate failed twice`
                    : `${engine.name}: clean-context retry failed after a retryable performance sample`,
                `first: ${firstFailure.slice(0, 3500)}`,
                `retry: ${retryFailure.slice(0, 3500)}`,
            ].join('\n'));
        }
    } finally {
        await launched.browser.close().catch(() => undefined);
    }
}

console.log(JSON.stringify({ summaries }, null, 2));
if (requestedEngines.size === 0) failures.push('No browser engines were requested');
failures.push(...requestedBrowserCoverageFailures(requestedEngines, summaries));
if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}
const ranEngines = summaries.filter(summary => !summary.skipped).map(summary => summary.engine);
console.log(`reddit-chrome-furigana smoke passed (engines: ${ranEngines.join(', ')})`);

function isRetryablePerformanceFailure(message) {
    return message.includes('boot responsiveness probe did not sample frames')
        || message.includes('reader boot starved the iPad-shaped frame lane')
        || message.includes('steady-state work can starve puck/input tasks')
        || message.includes('steady-state work delayed the puck input lane');
}

async function runEngine(engineName, browser) {
    const requests = [];
    const context = await browser.newContext({
        bypassCSP: true,
        colorScheme: 'dark',
        locale: 'ja-JP',
        viewport: { width: 760, height: 980 },
        hasTouch: true,
        isMobile: true,
        userAgent: IPAD_SAFARI_UA,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    try {
        await page.route(`https://www.reddit.com${PAGE_PATH}*`, route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            // WebKit models Safari full-page zoom as a narrower layout viewport
            // scaled to the unchanged browser surface. Chromium stays at 1× as
            // the normal-scale compatibility lane.
            body: PAGE.replace('__VIEWPORT_CONTENT__', engineName === 'webkit'
                ? 'width=475'
                : 'width=device-width, initial-scale=1'),
        }));
        await installUserscriptFixtureBridge(page, {
            requestBridgeName: REQUEST_BRIDGE,
            requestHandler: request => mockedYomuRequest(request, requests),
            settings,
            css: readFileSync(CSS_PATH, 'utf8'),
        });
        await page.goto(`https://www.reddit.com${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(installProjectedReadingDiagnostics);
        const baseline = await page.evaluate(snapshotRedditLayout);
        await page.addStyleTag({ path: CSS_PATH });
        for (const companionPath of REQUIRED_COMPANION_PATHS) {
            await page.addScriptTag({ path: companionPath });
        }
        await page.addScriptTag({ path: SCRIPT_PATH });
        const signInFrame = page.frame({ name: 'late-localizing-signin' });
        assert(signInFrame, `${engineName}: late-localizing sign-in frame was not available`);
        await signInFrame.evaluate(installProjectedReadingDiagnostics);
        await signInFrame.addStyleTag({ path: CSS_PATH });
        for (const companionPath of REQUIRED_COMPANION_PATHS) {
            await signInFrame.addScriptTag({ path: companionPath });
        }
        await signInFrame.addScriptTag({ path: SCRIPT_PATH });
        const latinSignInWordCount = await signInFrame.locator('#google-signin .jpdb-reader-word').count();
        assert(latinSignInWordCount === 0,
            `${engineName}: Latin sign-in placeholder was parsed before localization`, { latinSignInWordCount });
        // Script injection includes Playwright reading, parsing, and compiling
        // the 2 MB userscript. That host/harness cost can pause an otherwise
        // idle WebKit page for more than a second on a cold CI runner and is
        // not reader work. Start the frame probe after injection so the same
        // strict 250 ms ceiling measures Yomu's asynchronous boot scans,
        // annotations, and UI hydration instead of browser compilation.
        await page.evaluate(startRedditResponsivenessProbe);

        // Wait for Yomu's initial light-DOM pass, then hydrate the existing
        // open-shadow controls. Before the fix their Latin/empty roots were
        // rejected without observer registration, so these mutations stayed
        // bare until an unrelated page event happened to trigger a scan.
        await Promise.all([
            page.locator('#create-post .jpdb-reader-word').nth(1).waitFor({ timeout: 20_000 }),
            page.locator('#card-metadata .jpdb-reader-word').nth(1).waitFor({ timeout: 20_000 }),
            page.locator('#award-control .jpdb-reader-word[data-expression="贈る"]').waitFor({ timeout: 20_000 }),
            page.locator('#share .jpdb-reader-word').first().waitFor({ timeout: 20_000 }),
            page.locator('#clipped-reader-row .jpdb-reader-additive-text-mirror').waitFor({ timeout: 20_000, state: 'attached' }),
        ]);
        const localizedControlBoxes = await page.evaluate(() => {
            const join = document.querySelector('reddit-header-shell').shadowRoot
                .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
            join.textContent = '参加';
            document.querySelector('reddit-feed-control').shadowRoot.querySelector('#feed').textContent = 'フィード';
            const sortRoot = document.querySelector('reddit-sort-control').shadowRoot;
            const sort = sortRoot.querySelector('#sort');
            sort.textContent = '賛成票率順⌄';
            sortRoot.querySelector('#menu-heading').textContent = '並べ替え基準';
            sortRoot.querySelector('#menu-hot').textContent = '注目順';
            sortRoot.querySelector('#menu-new').textContent = '新しい順';
            sortRoot.querySelector('#menu-votes').textContent = '賛成票数順';
            const boxGeometry = element => ({
                overflow: getComputedStyle(element).overflow,
                inlineOverflow: element.style.getPropertyValue('overflow'),
                client: [element.clientWidth, element.clientHeight],
                scroll: [element.scrollWidth, element.scrollHeight],
            });
            return {
                join: boxGeometry(join),
                sort: boxGeometry(sort),
            };
        });
        Object.assign(baseline.controlBoxes, localizedControlBoxes);
        await signInFrame.locator('#google-signin').evaluate(button => {
            button.textContent = 'Google で続ける';
        });

        await Promise.all([
            page.locator('#join .jpdb-reader-word').first().waitFor({ timeout: 20_000 }),
            page.locator('#feed .jpdb-reader-word').first().waitFor({ timeout: 20_000 }),
            page.locator('#sort .jpdb-reader-word').first().waitFor({ timeout: 20_000 }),
            page.locator('.jpdb-reader-fab').waitFor({ timeout: 20_000 }),
            signInFrame.locator('#google-signin .jpdb-reader-word[data-expression="続ける"]').waitFor({ timeout: 20_000 }),
        ]);
        // The iframe sign-in button is rendered via the DESTRUCTIVE in-place path
        // (word spans injected straight into the <button>), so it proves chrome is
        // annotated at rest on that path too, not just through the control mirror.
        await signInFrame.waitForFunction(() => {
            const button = document.querySelector('#google-signin');
            const readings = window.__yomuProjectedReadingDiagnostics(button);
            return readings.sources.length > 0
                && readings.associations.length === readings.sources.length;
        }, null, { timeout: 20_000 });
        const lateLocalizedSignIn = await signInFrame.locator('#google-signin').evaluate(button => {
            const readings = window.__yomuProjectedReadingDiagnostics(button);
            return {
                text: button.textContent?.trim() ?? '',
                expressions: [...button.querySelectorAll('.jpdb-reader-word')]
                    .map(word => word.dataset.expression ?? ''),
                words: button.querySelectorAll('.jpdb-reader-word').length,
                sourceFurigana: readings.sources.length,
                sourceFuriganaVisible: readings.sources.filter(readings.visible).length,
                projectedFurigana: readings.associations.length,
                pitchWords: button.querySelectorAll('.jpdb-reader-word[data-pitch-class]:not([data-pitch-class="unknown"])').length,
            };
        });
        // In-place path: a control localized to Japanese long after boot is
        // enriched (word parsed, source furigana + pitch present) and painted
        // at rest, exactly like any other text.
        assert(lateLocalizedSignIn.expressions.includes('続ける')
            && lateLocalizedSignIn.words > 0
            && lateLocalizedSignIn.sourceFurigana > 0
            // The source reading stays out of page layout; the projected clone
            // is what the user actually reads, and chrome shows it at rest.
            && lateLocalizedSignIn.sourceFuriganaVisible === 0
            && lateLocalizedSignIn.projectedFurigana > 0
            && lateLocalizedSignIn.pitchWords > 0,
        `${engineName}: a Latin embedded control was not enriched after Japanese localization`, lateLocalizedSignIn);
        // No rest-hiding marker may exist anywhere: chrome is annotated at rest.
        const commandMarkers = await signInFrame.locator('#google-signin').evaluate(button =>
            Number(Boolean(button.closest('[data-yomu-command-control]')))
            + button.querySelectorAll('[data-yomu-command-control]').length);
        assert(commandMarkers === 0, `${engineName}: a bare-until-hover marker survived on chrome`, { commandMarkers });
        await page.waitForTimeout(400);
        const responsiveness = await page.evaluate(stopRedditResponsivenessProbe);
        // Let Yomu's deliberately delayed 1.5s clamp/readings sweep finish,
        // then prove a static Reddit page stays static: no scan/API churn, no
        // mirror recreation, and no task/frame starvation behind the puck.
        await page.waitForTimeout(4_000);
        const requestsBeforeSteadyState = requests.length;
        const steadyState = await page.evaluate(profileRedditSteadyState);
        steadyState.requestDelta = requests.length - requestsBeforeSteadyState;
        assertRedditPerformance(engineName, responsiveness, steadyState);

        // Generic composed-DOM discovery: append the late-join/late-hydrate
        // hosts only AFTER Yomu has booted, then assert both get annotated
        // without any further page interaction (see fixture comment above).
        await page.evaluate(() => {
            const hosts = [
                document.createElement('reddit-late-hydrate-host'),
                document.createElement('reddit-late-upgrade-host'),
                // Put the already-Japanese host last: discovery must not
                // short-circuit and strand the earlier empty/undefined hosts.
                document.createElement('reddit-late-join-host'),
            ];
            // Keep every lifecycle fixture inside both scaled and unscaled
            // viewports without changing Reddit's authored flow geometry or
            // stacking their furigana lanes on top of one another.
            hosts.forEach((host, index) => {
                host.style.cssText = `position:absolute;inset:${24 + index * 64}px 8px auto auto`;
            });
            document.body.append(...hosts);
        });
        // Let the document observer encounter the still-undefined element
        // before definition; upgrading/attachShadow itself emits no light-DOM
        // mutation, so only the whenDefined wakeup can discover this root.
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            customElements.define('reddit-late-upgrade-host', class extends HTMLElement {
                constructor() {
                    super();
                    this.attachShadow({ mode: 'open' }).innerHTML = '<button id="late-upgrade">並べ替え基準</button>';
                }
            });
        });
        try {
            await page.locator('#late-join .jpdb-reader-word').first().waitFor({ timeout: 20_000 });
            await page.locator('#late-hydrate .jpdb-reader-word').first().waitFor({ timeout: 20_000 });
            await page.locator('#late-upgrade .jpdb-reader-word').first().waitFor({ timeout: 20_000 });
        } catch (error) {
            const lateState = await page.evaluate(() => Object.fromEntries(
                ['reddit-late-join-host', 'reddit-late-hydrate-host', 'reddit-late-upgrade-host'].map(selector => {
                    const host = document.querySelector(selector);
                    const root = host?.shadowRoot;
                    const rect = host?.getBoundingClientRect();
                    return [selector, {
                        connected: Boolean(host?.isConnected),
                        text: root?.textContent?.trim() ?? '',
                        words: root?.querySelectorAll('.jpdb-reader-word').length ?? 0,
                        rect: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
                    }];
                }),
            ));
            throw new Error(`${String(error)}\nlate state: ${JSON.stringify({ lateState, innerHeight: await page.evaluate(() => innerHeight) }, null, 2)}`);
        }

        await page.locator('#create-post').click();
        await page.locator('#award-control').click();
        await page.locator('#share').click();
        await page.evaluate(() => {
            const join = document.querySelector('reddit-header-shell').shadowRoot
                .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
            const sort = document.querySelector('reddit-sort-control').shadowRoot.querySelector('#sort');
            join.click();
            sort.click();
        });
        await page.locator('#menu-heading .jpdb-reader-word').first().waitFor({ timeout: 20_000 });
        await page.locator('#menu-votes .jpdb-reader-word').first().waitFor({ timeout: 20_000 });
        await page.locator('.jpdb-reader-fab').click();
        await waitForSettledRadialMenu(page);

        const snapshot = await snapshotRedditRegression(page);
        const touchHover = await snapshotTouchHoverSafety(page);
        const screenshot = path.join(ARTIFACTS, `reddit-chrome-furigana-smoke-${engineName}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        assertRedditRegression(engineName, baseline, snapshot, touchHover, pageErrors);
        // snapshotRedditRegression closes the opaque menu after checking its
        // own labels so the background-label assertions prove restoration.
        const fixedChrome = await exerciseCompensatedFixedChrome(page);
        assertCompensatedFixedChrome(engineName, fixedChrome);
        const videoAvoidance = await exerciseCompensatedVideoAvoidance(page);
        assertCompensatedVideoAvoidance(engineName, videoAvoidance);
        const puckDrag = await exerciseCompensatedPuckDrag(page);
        assertCompensatedPuckDrag(engineName, puckDrag);
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
        assert(pageErrors.length === 0, `${engineName}: pointer/video checks raised page errors`, pageErrors);
        return {
            engine: engineName,
            screenshot,
            requests: requests.length,
            baseline,
            touchHover,
            fixedChrome,
            videoAvoidance,
            puckDrag,
            mirrorRemovalFallback,
            lateLocalizedSignIn,
            performance: {
                responsiveness,
                steadyState,
            },
            ...snapshot,
        };
    } finally {
        await context.close().catch(() => undefined);
    }
}

function startRedditResponsivenessProbe() {
    const state = {
        startedAt: performance.now(),
        firstFrameAt: null,
        previousFrame: null,
        frameGaps: [],
        stopped: false,
    };
    window.__yomuRedditResponsivenessProbe = state;
    const frame = now => {
        // The first callback establishes cadence; only gaps between rendered
        // frames are evidence that reader work starved the frame lane.
        if (state.previousFrame === null) state.firstFrameAt = performance.now();
        else state.frameGaps.push(now - state.previousFrame);
        state.previousFrame = now;
        if (!state.stopped) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

async function stopRedditResponsivenessProbe() {
    const state = window.__yomuRedditResponsivenessProbe;
    // Playwright's host-side wait can elapse while a cold WebKit renderer is
    // still finishing reader boot. Give the page itself a bounded chance to
    // render enough frames for a real cadence measurement before stopping.
    await Promise.race([
        new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        new Promise(resolve => setTimeout(resolve, 1_000)),
    ]);
    state.stopped = true;
    const sorted = [...state.frameGaps].sort((a, b) => a - b);
    const percentile = value => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] ?? 0;
    return {
        bootMs: performance.now() - state.startedAt,
        firstFrameDelayMs: (state.firstFrameAt ?? performance.now()) - state.startedAt,
        frameCount: sorted.length,
        maxFrameGapMs: sorted.at(-1) ?? 0,
        p95FrameGapMs: percentile(0.95),
    };
}

async function profileRedditSteadyState() {
    const stats = {
        callbacks: 0,
        records: 0,
        attributeRecords: 0,
        characterDataRecords: 0,
        mutationSamples: [],
        addedNodes: 0,
        removedNodes: 0,
        mirrorAdds: 0,
        mirrorRemoves: 0,
        maxTaskGapMs: 0,
        maxFrameGapMs: 0,
        maxInputLatencyMs: 0,
    };
    const observers = [];
    const observed = new Set();
    const nodeMatches = (node, selector) => node instanceof Element
        && (node.matches(selector) || Boolean(node.querySelector(selector)));
    const observe = root => {
        if (observed.has(root)) return;
        observed.add(root);
        const observer = new MutationObserver(records => {
            stats.callbacks += 1;
            stats.records += records.length;
            for (const record of records) {
                if (record.type === 'attributes') stats.attributeRecords += 1;
                if (record.type === 'characterData') stats.characterDataRecords += 1;
                if (stats.mutationSamples.length < 12) {
                    stats.mutationSamples.push({
                        type: record.type,
                        attribute: record.attributeName,
                        oldValue: record.oldValue,
                        value: record.target instanceof Element && record.attributeName
                            ? record.target.getAttribute(record.attributeName)
                            : null,
                        target: record.target instanceof Element
                            ? `${record.target.localName}.${record.target.className}`.slice(0, 180)
                            : '#text',
                    });
                }
                stats.addedNodes += record.addedNodes.length;
                stats.removedNodes += record.removedNodes.length;
                for (const node of record.addedNodes) {
                    if (nodeMatches(node, '.jpdb-reader-text-mirror')) stats.mirrorAdds += 1;
                }
                for (const node of record.removedNodes) {
                    if (nodeMatches(node, '.jpdb-reader-text-mirror')) stats.mirrorRemoves += 1;
                }
            }
        });
        observer.observe(root, {
            attributes: true,
            attributeOldValue: true,
            characterData: true,
            childList: true,
            subtree: true,
        });
        observers.push(observer);
        root.querySelectorAll?.('*').forEach(element => {
            if (element.shadowRoot) observe(element.shadowRoot);
        });
    };
    observe(document);

    const startedAt = performance.now();
    let previousTask = startedAt;
    let previousFrame = startedAt;
    let stopped = false;
    const puck = document.querySelector('.jpdb-reader-fab');
    let expectedInputAt = startedAt + 50;
    const onInputProbe = event => {
        if (event.clientX !== -9999) return;
        event.stopImmediatePropagation();
        stats.maxInputLatencyMs = Math.max(stats.maxInputLatencyMs, performance.now() - expectedInputAt);
    };
    window.addEventListener('pointermove', onInputProbe, { capture: true });
    const task = () => {
        const now = performance.now();
        stats.maxTaskGapMs = Math.max(stats.maxTaskGapMs, now - previousTask);
        previousTask = now;
        if (!stopped) setTimeout(task, 16);
    };
    const frame = now => {
        stats.maxFrameGapMs = Math.max(stats.maxFrameGapMs, now - previousFrame);
        previousFrame = now;
        if (!stopped) requestAnimationFrame(frame);
    };
    const input = () => {
        puck?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -9999, clientY: -9999 }));
        expectedInputAt = performance.now() + 50;
        if (!stopped) setTimeout(input, 50);
    };
    setTimeout(task, 16);
    requestAnimationFrame(frame);
    setTimeout(input, 50);
    await new Promise(resolve => setTimeout(resolve, 1_200));
    stopped = true;
    window.removeEventListener('pointermove', onInputProbe, { capture: true });
    observers.forEach(observer => observer.disconnect());
    return stats;
}

function assertRedditPerformance(engineName, responsiveness, steadyState) {
    assert(responsiveness.frameCount >= 2,
        `${engineName}: boot responsiveness probe did not sample frames`, responsiveness);
    // Hosted WebKit runners occasionally miss one additional 60 Hz frame while
    // the multi-megabyte userscript boots. Keep the boot ceiling strict enough
    // to catch a visible stall while leaving the steady-state 100 ms input/frame
    // limits below as the primary regression guard.
    assert(responsiveness.maxFrameGapMs <= 300,
        `${engineName}: reader boot starved the iPad-shaped frame lane`, responsiveness);
    assert(steadyState.requestDelta === 0,
        `${engineName}: a static Reddit fixture kept scheduling parse work`, steadyState);
    assert(steadyState.records === 0,
        `${engineName}: a static Reddit fixture kept writing DOM after settling`, steadyState);
    assert(steadyState.mirrorAdds === 0 && steadyState.mirrorRemoves === 0,
        `${engineName}: Reddit mirrors were recreated at steady state`, steadyState);
    assert(steadyState.maxTaskGapMs <= 100 && steadyState.maxFrameGapMs <= 100,
        `${engineName}: steady-state work can starve puck/input tasks`, steadyState);
    assert(steadyState.maxInputLatencyMs <= 100,
        `${engineName}: steady-state work delayed the puck input lane`, steadyState);
}

function userscriptCompanionPaths(userscriptPath) {
    return readFileSync(userscriptPath, 'utf8')
        .split(/\r?\n/u)
        .flatMap(line => {
            const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
            if (!match) return [];
            const fileName = path.basename(match[1]);
            assert(fileName === match[1], `Unsafe userscript companion path: ${match[1]}`);
            const hostedPath = path.join(ROOT, 'docs/public/greasyfork', fileName);
            if (existsSync(hostedPath)) return [hostedPath];

            // A source-validation worktree can contain a freshly built core
            // before the hosted, content-addressed copies are synchronized.
            // Exercise the matching local companion rather than a stale hash.
            const canonicalName = fileName.replace(/\.[a-f0-9]{12}(?=\.user\.js$)/u, '');
            return [path.join(ROOT, 'dist/greasyfork', canonicalName)];
        });
}

async function exerciseCompensatedFixedChrome(page) {
    const radialSurface = await snapshotFixedSurface(page, '.jpdb-reader-fab-radial.is-open');
    await clickSettledRadialAction(page, 'settings');
    const settingsRoot = page.locator('[data-sensitive-settings-launcher]');
    await settingsRoot.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(250);
    const settingsSurface = await snapshotFixedSurface(page, '[data-sensitive-settings-launcher]');
    const settingsBoundary = await settingsRoot.evaluate((root, configuredSecret) => {
        const launcher = root.querySelector('[data-trusted-settings-launcher]');
        const elements = [root, ...root.querySelectorAll('*')];
        return {
            markedSensitiveLauncher: root.getAttribute('data-sensitive-settings-launcher') === 'true',
            formCount: root.querySelectorAll('form').length,
            authoritativeControlCount: root.querySelectorAll('input, select, textarea, output').length,
            dragHandleCount: root.querySelectorAll('.jpdb-reader-settings-drag-handle').length,
            configuredSecretExposed: elements.some(element =>
                element.textContent?.includes(configuredSecret)
                || [...element.attributes].some(attribute => attribute.value.includes(configuredSecret))),
            launcherPresent: launcher instanceof HTMLButtonElement,
            launcherPublicTarget: launcher?.getAttribute('href')
                ?? launcher?.getAttribute('formaction')
                ?? launcher?.getAttribute('data-target')
                ?? '',
        };
    }, settings.apiKey);
    const trustedLauncher = settingsRoot.locator('[data-trusted-settings-launcher]');
    let resolveTrustedSettingsLaunch;
    const trustedSettingsLaunchPromise = new Promise(resolve => {
        resolveTrustedSettingsLaunch = resolve;
    });
    await page.exposeFunction(TRUSTED_SETTINGS_OPEN_BRIDGE, (url, target, features) => {
        resolveTrustedSettingsLaunch({ url, target, features });
    });
    await page.evaluate(openBridge => {
        const reportOpen = window[openBridge];
        window.open = (url, target, features) => {
            void reportOpen(String(url ?? ''), String(target ?? ''), String(features ?? ''));
            return null;
        };
    }, TRUSTED_SETTINGS_OPEN_BRIDGE);
    await trustedLauncher.evaluate(launcher => {
        launcher.setAttribute('formaction', 'https://attacker.example/phish');
        launcher.setAttribute('data-target', 'https://attacker.example/phish');
        launcher.textContent = 'Attacker settings';
    });
    await trustedLauncher.evaluate(launcher => launcher.focus());
    await page.keyboard.press('Enter');
    let launchTimeout;
    const trustedSettingsLaunch = await Promise.race([
        trustedSettingsLaunchPromise,
        new Promise((_, reject) => {
            launchTimeout = setTimeout(() => reject(new Error('Trusted settings launcher did not request navigation')), 10_000);
        }),
    ]).finally(() => clearTimeout(launchTimeout));
    await page.keyboard.press('Escape');
    await settingsRoot.waitFor({ state: 'detached', timeout: 10_000 });

    const popupAnchor = page.locator('#popup-anchor .jpdb-reader-word').first();
    await popupAnchor.click();
    const popover = page.locator('.jpdb-reader-popover:not(.jpdb-reader-sheet)');
    await popover.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(350);
    const popoverSurface = await snapshotAnchoredPopover(page);
    const sourceSummary = popover.locator('details > summary').first();
    let popupControlClick = { available: false, changed: false };
    if (await sourceSummary.count()) {
        const beforeOpen = await sourceSummary.evaluate(summary => summary.parentElement?.hasAttribute('open') ?? false);
        await sourceSummary.click();
        const afterOpen = await sourceSummary.evaluate(summary => summary.parentElement?.hasAttribute('open') ?? false);
        popupControlClick = { available: true, changed: beforeOpen !== afterOpen };
    }
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'detached', timeout: 10_000 });

    return {
        radial: radialSurface,
        settings: settingsSurface,
        settingsBoundary,
        trustedSettingsLaunch,
        popover: popoverSurface,
        popupControlClick,
    };
}

async function waitForSettledRadialMenu(page) {
    const radial = page.locator('.jpdb-reader-fab-radial.is-open');
    await radial.waitFor({ timeout: 5_000 });
    try {
        await page.waitForFunction(snapshotRadialMenuReadiness, false, { timeout: 5_000 });
    } catch (error) {
        const readiness = await page.evaluate(snapshotRadialMenuReadiness, true);
        throw new Error(`Radial menu did not become geometrically clickable: ${JSON.stringify(readiness)}`, {
            cause: error,
        });
    }
}

function snapshotRadialMenuReadiness(returnUnready) {
    const radial = document.querySelector('.jpdb-reader-fab-radial.is-open');
    const items = [...document.querySelectorAll(
        '.jpdb-reader-fab-radial.is-open .jpdb-reader-fab-radial-item',
    )];
    const puck = document.querySelector('.jpdb-reader-fab');
    const pageScale = outerWidth / innerWidth;
    const rawPuckRect = puck?.getBoundingClientRect();
    const measuredPuckScale = puck?.offsetWidth
        ? rawPuckRect.width / puck.offsetWidth
        : 1;
    const physicalScale = pageScale > 1
        && Math.abs(measuredPuckScale - 1 / pageScale) < Math.abs(measuredPuckScale - 1)
        ? pageScale
        : 1;
    const rects = items.map(item => item.getBoundingClientRect());
    const centers = rects.map(rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    const widths = rects.map(rect => rect.width * physicalScale);
    const distances = centers.slice(1).map((center, index) => Math.hypot(
        center.x - centers[index].x,
        center.y - centers[index].y,
    ) * physicalScale);
    const hitTargets = items.map((item, index) => {
        const center = centers[index];
        return document.elementFromPoint(center.x / pageScale, center.y / pageScale)
            ?.closest('.jpdb-reader-fab-radial-item') === item;
    });
    const animationStates = radial?.getAnimations({ subtree: true })
        .map(animation => animation.playState) ?? [];
    const animationsSettled = animationStates.every(state => state === 'finished');
    const ready = animationsSettled
        && rects.length >= 6
        && widths.every(width => width >= 45 && width <= 51)
        && distances.every(distance => distance >= 60)
        && hitTargets.every(Boolean);
    const readiness = {
        ready,
        pageScale,
        physicalScale,
        widths,
        distances,
        hitTargets,
        animationStates,
    };
    return ready || returnUnready ? readiness : false;
}

async function clickSettledRadialAction(page, actionId) {
    await waitForSettledRadialMenu(page);
    const target = await page.locator(`[data-radial-id="${actionId}"]`).evaluate(action => {
        const rect = action.getBoundingClientRect();
        return {
            x: (rect.left + rect.width / 2) / (outerWidth / innerWidth),
            y: (rect.top + rect.height / 2) / (outerWidth / innerWidth),
        };
    });
    await page.mouse.click(target.x, target.y);
}

async function snapshotFixedSurface(page, selector) {
    return page.locator(selector).evaluate(root => {
        const pageScale = outerWidth / innerWidth;
        const rawRootRect = root.getBoundingClientRect();
        const compensatedRectScale = measuredCompensatedRectScale(root, rawRootRect, pageScale);
        const plainRect = (rect, scale = 1) => ({
            left: rect.left * scale,
            top: rect.top * scale,
            right: rect.right * scale,
            bottom: rect.bottom * scale,
            width: rect.width * scale,
            height: rect.height * scale,
        });
        const textRect = firstTextRect(root);
        const backdrop = document.querySelector('.jpdb-reader-backdrop');
        const backdropRect = backdrop?.getBoundingClientRect();
        return {
            rect: plainRect(rawRootRect, compensatedRectScale),
            textRect: textRect ? plainRect(textRect, compensatedRectScale) : null,
            fontSize: Number.parseFloat(getComputedStyle(root).fontSize),
            inlineZoom: root.style.getPropertyValue('zoom'),
            zoomPriority: root.style.getPropertyPriority('zoom'),
            adapter: root.dataset.jpdbReaderScaleAdapter ?? '',
            pageScale,
            compensatedRectScale,
            browser: { width: outerWidth, height: innerHeight * pageScale },
            backdrop: backdrop && backdropRect ? {
                rect: plainRect(backdropRect),
                physicalWidth: backdropRect.width * pageScale,
                physicalHeight: backdropRect.height * pageScale,
                inlineZoom: backdrop.style.getPropertyValue('zoom'),
                adapter: backdrop.dataset.jpdbReaderScaleAdapter ?? '',
            } : null,
        };

        function firstTextRect(scope) {
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.data.trim() || node.parentElement?.closest('[hidden]')) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return rect;
            }
            return null;
        }

        function measuredCompensatedRectScale(element, rect, scale) {
            if (scale <= 1 || !element.offsetWidth) return 1;
            const measured = rect.width / element.offsetWidth;
            return Math.abs(measured - 1 / scale) < Math.abs(measured - 1) ? scale : 1;
        }
    });
}

async function snapshotAnchoredPopover(page) {
    return page.evaluate(() => {
        const popover = document.querySelector('.jpdb-reader-popover:not(.jpdb-reader-sheet)');
        const anchor = document.querySelector('#popup-anchor .jpdb-reader-word');
        if (!(popover instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return null;
        const plainRect = rect => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        });
        const pageScale = outerWidth / innerWidth;
        const anchorLayout = anchor.getBoundingClientRect();
        const anchorOverlay = {
            left: anchorLayout.left * pageScale,
            top: anchorLayout.top * pageScale,
            right: anchorLayout.right * pageScale,
            bottom: anchorLayout.bottom * pageScale,
            width: anchorLayout.width * pageScale,
            height: anchorLayout.height * pageScale,
        };
        const popoverRect = popover.getBoundingClientRect();
        const compensatedRectScale = measuredCompensatedRectScale(popover, popoverRect, pageScale);
        const title = popover.querySelector('.jpdb-reader-title-row, .jpdb-reader-heading, h2');
        const walker = title ? document.createTreeWalker(title, NodeFilter.SHOW_TEXT) : null;
        let textNode = walker?.nextNode() ?? null;
        while (textNode && !textNode.data.trim()) textNode = walker?.nextNode() ?? null;
        const range = textNode ? document.createRange() : null;
        if (range && textNode) range.selectNodeContents(textNode);
        const textRect = range?.getBoundingClientRect();
        const header = popover.querySelector('.jpdb-reader-header');
        const components = popover.querySelectorAll('.jpdb-reader-pitch-components, .jpdb-reader-pitch-variants');
        return {
            rect: scalePlainRect(popoverRect, compensatedRectScale),
            anchorLayout: plainRect(anchorLayout),
            anchorOverlay,
            pageScale,
            compensatedRectScale,
            browser: { width: outerWidth, height: innerHeight * pageScale },
            placementSide: popover.dataset.jpdbReaderPlacementSide ?? '',
            inlineZoom: popover.style.getPropertyValue('zoom'),
            zoomPriority: popover.style.getPropertyPriority('zoom'),
            adapter: popover.dataset.jpdbReaderScaleAdapter ?? '',
            configuredWidth: popover.style.width,
            computedFontSize: Number.parseFloat(getComputedStyle(popover).fontSize),
            textHeight: (textRect?.height ?? 0) * compensatedRectScale,
            componentCount: components.length,
            headerDisplay: header ? getComputedStyle(header).display : '',
        };

        function scalePlainRect(rect, scale) {
            return {
                left: rect.left * scale,
                top: rect.top * scale,
                right: rect.right * scale,
                bottom: rect.bottom * scale,
                width: rect.width * scale,
                height: rect.height * scale,
            };
        }


        function measuredCompensatedRectScale(element, rect, scale) {
            if (scale <= 1 || !element.offsetWidth) return 1;
            const measured = rect.width / element.offsetWidth;
            return Math.abs(measured - 1 / scale) < Math.abs(measured - 1) ? scale : 1;
        }
    });
}

function assertCompensatedFixedChrome(engineName, result) {
    const expectedAdapter = engineName === 'webkit' ? 'apple-touch-page-scale' : '';
    assertCompensatedRadial(engineName, result.radial, expectedAdapter);
    assertCompensatedSurface(engineName, 'settings', result.settings, expectedAdapter);
    assertSettingsScrim(engineName, result.settings);
    assertOffhostSettingsBoundary(engineName, result.settingsBoundary);
    assertTrustedSettingsLaunch(engineName, result.trustedSettingsLaunch);
    assertCompensatedPopover(engineName, result, expectedAdapter);
}

function assertCompensatedRadial(engineName, radial, expectedAdapter) {
    assert(radial.adapter === expectedAdapter,
        `${engineName}: radial menu has the wrong Reddit scale ownership`, radial);
    const coversViewport = Math.abs(radial.rect.width - radial.browser.width) <= 2
        && Math.abs(radial.rect.height - radial.browser.height) <= 2;
    assert(coversViewport,
        `${engineName}: compensated radial menu did not cover the physical browser viewport`, radial);
    assertCompensatedZoom(engineName, 'radial menu', radial);
}

function assertCompensatedSurface(engineName, name, surface, expectedAdapter) {
    assert(surface.adapter === expectedAdapter,
        `${engineName}: ${name} fixed surface has the wrong Reddit scale ownership`, surface);
    assert(surface.rect.width > 0,
        `${engineName}: ${name} fixed surface had no physical width`, surface);
    assert(surface.rect.width <= surface.browser.width + 1,
        `${engineName}: ${name} fixed surface escaped the physical browser width`, surface);
    assert(surface.rect.height > 0,
        `${engineName}: ${name} fixed surface had no physical height`, surface);
    assert(surface.rect.height <= surface.browser.height + 1,
        `${engineName}: ${name} fixed surface escaped the physical browser viewport`, surface);
    assert(surface.textRect,
        `${engineName}: ${name} text did not produce a physical rectangle`, surface);
    assert(surface.textRect.height >= 10,
        `${engineName}: ${name} text collapsed below its physical minimum`, surface);
    assert(surface.textRect.height <= 32,
        `${engineName}: ${name} text remained physically enlarged`, surface);
    assertCompensatedZoom(engineName, name, surface);
}

function assertCompensatedZoom(engineName, name, surface) {
    if (engineName === 'webkit') {
        const isolated = surface.inlineZoom === '0.625' && surface.zoomPriority === 'important';
        assert(isolated, `${engineName}: ${name} did not receive inverse page-scale isolation`, surface);
        return;
    }
    assert(surface.inlineZoom === '',
        `${engineName}: ${name} received unnecessary scale compensation`, surface);
}

function assertSettingsScrim(engineName, settingsSurface) {
    const backdrop = settingsSurface.backdrop;
    const unscaled = backdrop && backdrop.inlineZoom === '' && backdrop.adapter === '';
    assert(unscaled,
        `${engineName}: settings scrim was inverse-scaled with its content root`, settingsSurface);
    const coversViewport = Math.abs(backdrop.physicalWidth - settingsSurface.browser.width) <= 2
        && Math.abs(backdrop.physicalHeight - settingsSurface.browser.height) <= 2;
    assert(coversViewport,
        `${engineName}: unscaled settings scrim did not cover the physical browser viewport`, settingsSurface);
}

function assertOffhostSettingsBoundary(engineName, boundary) {
    assert(boundary.markedSensitiveLauncher,
        `${engineName}: Reddit settings launcher was not marked as sensitive`, boundary);
    assert(boundary.formCount === 0,
        `${engineName}: Reddit exposed an authoritative settings form`, boundary);
    assert(boundary.authoritativeControlCount === 0,
        `${engineName}: Reddit exposed authoritative settings controls`, boundary);
    assert(boundary.dragHandleCount === 0,
        `${engineName}: Reddit exposed a settings drag surface`, boundary);
    assert(!boundary.configuredSecretExposed,
        `${engineName}: Reddit exposed a configured secret`, boundary);
    assert(boundary.launcherPresent,
        `${engineName}: Reddit did not render the safe settings launcher`, boundary);
    assert(boundary.launcherPublicTarget === '',
        `${engineName}: Reddit exposed authoritative settings instead of the offhost launcher`, boundary);
}

function assertTrustedSettingsLaunch(engineName, launch) {
    const canonicalLaunch = launch.url === TRUSTED_SETTINGS_URL
        && launch.target === '_blank'
        && launch.features === 'noopener';
    assert(canonicalLaunch,
        `${engineName}: the offhost launcher did not use its captured trusted settings target`, launch);
}

function assertCompensatedPopover(engineName, result, expectedAdapter) {
    const popup = result.popover;
    assert(popup, `${engineName}: anchored popover did not render`);
    assert(popup.adapter === expectedAdapter,
        `${engineName}: anchored popover has the wrong Reddit scale ownership`, popup);
    assert(Math.abs(popup.rect.width - 520) <= 2,
        `${engineName}: Reddit page scale enlarged the configured popup width`, popup);
    assert(popup.rect.left >= -1,
        `${engineName}: anchored popup escaped the left browser edge`, popup);
    assert(popup.rect.top >= -1,
        `${engineName}: anchored popup escaped the top browser edge`, popup);
    assert(popup.rect.right <= popup.browser.width + 1,
        `${engineName}: anchored popup escaped the right browser edge`, popup);
    assert(popup.rect.bottom <= popup.browser.height + 1,
        `${engineName}: anchored popup was not clamped to the physical browser viewport`, popup);
    assert(popup.placementSide === 'above',
        `${engineName}: anchored popup chose the wrong placement side`, popup);
    assert(popup.rect.top < popup.anchorOverlay.top,
        `${engineName}: anchored popup did not start above its normalized host anchor`, popup);
    assert(popup.rect.bottom >= popup.anchorOverlay.top - 24,
        `${engineName}: anchored popup was detached above its normalized host anchor`, popup);
    assert(popup.rect.bottom <= popup.anchorOverlay.bottom + 1,
        `${engineName}: anchored popup was not placed against the normalized host anchor`, popup);
    assert(popup.textHeight >= 12,
        `${engineName}: popup title text collapsed below its physical minimum`, popup);
    assert(popup.textHeight <= 32,
        `${engineName}: popup title text remained physically enlarged`, popup);
    if (popup.componentCount > 0) {
        assert(popup.headerDisplay === 'grid',
            `${engineName}: popup container query did not use the compensated content width`, popup);
    }
    if (result.popupControlClick.available) {
        assert(result.popupControlClick.changed,
            `${engineName}: a control inside the compensated popup did not receive its click`, result.popupControlClick);
    }
}

async function exerciseCompensatedVideoAvoidance(page) {
    const puck = page.locator('.jpdb-reader-fab');
    const radial = page.locator('.jpdb-reader-fab-radial');
    if (await radial.count()) {
        await puck.click();
        await radial.waitFor({ state: 'detached', timeout: 5_000 });
    }
    await page.mouse.move(0, 0);

    const marked = await page.evaluate(async () => {
        const asPlainRect = rect => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        });
        const waitFrames = count => new Promise(resolve => {
            const next = () => {
                if (count-- <= 0) resolve();
                else requestAnimationFrame(next);
            };
            next();
        });
        const button = document.querySelector('.jpdb-reader-fab');
        const pageScale = outerWidth / innerWidth;
        const rawBefore = asPlainRect(button.getBoundingClientRect());
        const compensatedRectScale = measuredCompensatedRectScale(button, rawBefore, pageScale);
        const before = scaleRect(rawBefore, compensatedRectScale);
        const beforePosition = { left: button.style.left, top: button.style.top };
        const center = {
            x: (before.left + before.right) / (2 * pageScale),
            y: (before.top + before.bottom) / (2 * pageScale),
        };
        const video = document.createElement('video');
        video.id = 'reddit-overlay-scale-video';
        Object.assign(video.style, {
            position: 'fixed',
            left: `${center.x - 80}px`,
            top: `${center.y - 60}px`,
            width: '160px',
            height: '120px',
            pointerEvents: 'none',
        });
        document.body.appendChild(video);
        button.focus({ preventScroll: true });
        window.dispatchEvent(new Event('resize'));
        await waitFrames(3);
        return {
            pageScale,
            compensatedRectScale,
            before,
            beforePosition,
            position: { left: button.style.left, top: button.style.top },
            puck: scaleRect(asPlainRect(button.getBoundingClientRect()), compensatedRectScale),
            video: asPlainRect(video.getBoundingClientRect()),
            marked: button.classList.contains('jpdb-reader-fab-over-video'),
            focused: document.activeElement === button,
        };

        function scaleRect(rect, scale) {
            return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * scale]));
        }


        function measuredCompensatedRectScale(element, rect, scale) {
            if (scale <= 1 || !element.offsetWidth) return 1;
            const measured = rect.width / element.offsetWidth;
            return Math.abs(measured - 1 / scale) < Math.abs(measured - 1) ? scale : 1;
        }
    });

    await page.mouse.move(0, 0);
    const moved = await page.evaluate(async () => {
        const asPlainRect = rect => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        });
        const waitFrames = count => new Promise(resolve => {
            const next = () => {
                if (count-- <= 0) resolve();
                else requestAnimationFrame(next);
            };
            next();
        });
        const button = document.querySelector('.jpdb-reader-fab');
        const video = document.querySelector('#reddit-overlay-scale-video');
        const pageScale = outerWidth / innerWidth;
        const rawPuck = asPlainRect(button.getBoundingClientRect());
        const compensatedRectScale = measuredCompensatedRectScale(button, rawPuck, pageScale);
        button.blur();
        window.dispatchEvent(new Event('resize'));
        await waitFrames(3);
        const result = {
            puck: scaleRect(asPlainRect(button.getBoundingClientRect()), compensatedRectScale),
            video: asPlainRect(video.getBoundingClientRect()),
            marked: button.classList.contains('jpdb-reader-fab-over-video'),
            focused: document.activeElement === button,
        };
        video.remove();
        window.dispatchEvent(new Event('resize'));
        await waitFrames(2);
        return result;

        function scaleRect(rect, scale) {
            return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * scale]));
        }


        function measuredCompensatedRectScale(element, rect, scale) {
            if (scale <= 1 || !element.offsetWidth) return 1;
            const measured = rect.width / element.offsetWidth;
            return Math.abs(measured - 1 / scale) < Math.abs(measured - 1) ? scale : 1;
        }
    });

    return { marked, moved };
}

async function exerciseCompensatedPuckDrag(page) {
    const puck = page.locator('.jpdb-reader-fab');
    const before = await puck.evaluate(button => {
        const box = button.getBoundingClientRect();
        const rawRect = {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
        };
        const pageScale = outerWidth / innerWidth;
        const measured = button.offsetWidth ? rawRect.width / button.offsetWidth : 1;
        const compensatedRectScale = pageScale > 1
            && Math.abs(measured - 1 / pageScale) < Math.abs(measured - 1)
            ? pageScale
            : 1;
        return {
            rawRect,
            rect: scalePlainRect(rawRect, compensatedRectScale),
            compensatedRectScale,
            pageScale,
            layoutWidth: innerWidth,
            browserWidth: outerWidth,
            target: { x: outerWidth - 70, y: 150 },
        };

        function scalePlainRect(rect, scale) {
            return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * scale]));
        }
    });
    const start = {
        x: (before.rect.left + before.rect.right) / 2,
        y: (before.rect.top + before.rect.bottom) / 2,
    };
    await page.mouse.move(start.x / before.pageScale, start.y / before.pageScale);
    await puck.evaluate(button => {
        window.__redditPuckPointerLog = [];
        const record = event => window.__redditPuckPointerLog.push({
            type: event.type,
            clientX: event.clientX,
            clientY: event.clientY,
        });
        button.addEventListener('pointerdown', record, { once: true });
        button.addEventListener('pointermove', record);
        button.addEventListener('pointerup', record, { once: true });
    });
    await page.mouse.down();
    await page.mouse.move(
        before.target.x / before.pageScale,
        before.target.y / before.pageScale,
        { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForTimeout(100);

    return puck.evaluate((button, details) => {
        const box = button.getBoundingClientRect();
        const rawAfter = {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
        };
        return {
            ...details,
            rawAfter,
            after: Object.fromEntries(Object.entries(rawAfter)
                .map(([key, value]) => [key, value * details.compensatedRectScale])),
            pointerLog: window.__redditPuckPointerLog ?? [],
            saved: {
                left: Number.parseFloat(button.style.left),
                top: Number.parseFloat(button.style.top),
            },
        };
    }, { ...before, start });
}

function assertCompensatedVideoAvoidance(engineName, result) {
    const { marked, moved } = result;
    const normalizedVideo = scaleRect(marked.video, marked.pageScale);
    assert(marked.focused && marked.marked,
        `${engineName}: focused puck did not mark the normalized video overlap`, result);
    assert(marked.position.left === marked.beforePosition.left
        && marked.position.top === marked.beforePosition.top,
    `${engineName}: focused puck persisted a video-avoidance move`, result);
    assert(rectanglesIntersect(marked.puck, normalizedVideo),
        `${engineName}: video fixture did not physically cover the compensated puck`, result);
    if (engineName === 'webkit') {
        assert(!rectanglesIntersect(marked.puck, marked.video),
            `${engineName}: fixture did not reproduce layout/screen rect divergence`, result);
    } else {
        assert(rectanglesIntersect(marked.puck, marked.video),
            `${engineName}: normal-scale video unexpectedly changed coordinate space`, result);
    }
    assert(!moved.focused && !moved.marked && rectCenterDistance(marked.puck, moved.puck) >= 10,
        `${engineName}: puck did not move away after focus cleared`, result);
    assert(!rectanglesIntersect(moved.puck, scaleRect(moved.video, marked.pageScale)),
        `${engineName}: moved puck still overlaps the video in overlay space`, result);
}

function assertCompensatedPuckDrag(engineName, result) {
    const pointerDown = result.pointerLog.find(entry => entry.type === 'pointerdown');
    const pointerMoves = result.pointerLog.filter(entry => entry.type === 'pointermove');
    const pointerUp = result.pointerLog.find(entry => entry.type === 'pointerup');
    const finalMove = pointerMoves.at(-1);
    assert(pointerDown && finalMove && pointerUp,
        `${engineName}: browser drag did not deliver the full pointer sequence`, result);
    assert(pointDistance(scalePoint(pointerDown, result.pageScale), result.start) <= 2,
        `${engineName}: pointerdown did not expose the expected layout-space coordinate`, result);
    assert(pointDistance(scalePoint(finalMove, result.pageScale), result.target) <= 2
        && pointDistance(scalePoint(pointerUp, result.pageScale), result.target) <= 2,
    `${engineName}: pointer endpoint did not map to the browser surface`, result);
    const deliveredEndpoint = scalePoint(pointerUp, result.pageScale);
    const center = {
        x: (result.after.left + result.after.right) / 2,
        y: (result.after.top + result.after.bottom) / 2,
    };
    const persistedCenter = {
        x: result.saved.left + result.after.width / 2,
        y: result.saved.top + result.after.height / 2,
    };
    assert(pointDistance(persistedCenter, deliveredEndpoint) <= 2,
        `${engineName}: compensated puck did not persist the delivered drag endpoint`, result);
    if (isLinuxWebKitPort(engineName)) {
        // GTK WebKit reports an extra Y origin after a fixed, zoomed element
        // switches from bottom positioning to an explicit top. Keep the input,
        // persisted state, X geometry, and the isolated port offset strict.
        const reportedTopOffset = result.rawAfter.top - result.saved.top;
        assert(Math.abs(center.x - result.target.x) <= 3
            && Number.isFinite(reportedTopOffset)
            && reportedTopOffset >= 0 && reportedTopOffset <= 12,
        `${engineName}: fixed-zoom drag exceeded the Linux WebKit coordinate allowance`, result);
    } else {
        assert(pointDistance(center, result.target) <= 3,
            `${engineName}: compensated puck did not track the physical drag endpoint`, result);
    }
    assert(center.x > result.browserWidth - 100,
        `${engineName}: puck did not reach the far side of the full browser viewport`, result);
    if (engineName === 'webkit') {
        assert(center.x > result.layoutWidth,
            `${engineName}: puck remained trapped inside the narrowed layout viewport`, result);
    } else {
        assert(Math.abs(result.pageScale - 1) <= 0.01 && center.x < result.layoutWidth,
            `${engineName}: normal-scale drag unexpectedly changed coordinate space`, result);
    }
}

function scalePoint(point, scale) {
    return { x: point.clientX * scale, y: point.clientY * scale };
}

function scaleRect(rect, scale) {
    return {
        left: rect.left * scale,
        top: rect.top * scale,
        right: rect.right * scale,
        bottom: rect.bottom * scale,
        width: rect.width * scale,
        height: rect.height * scale,
    };
}

function pointDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function rectCenterDistance(left, right) {
    return Math.hypot(
        (left.left + left.right - right.left - right.right) / 2,
        (left.top + left.bottom - right.top - right.bottom) / 2,
    );
}

function rectanglesIntersect(left, right) {
    return left.left < right.right && left.right > right.left
        && left.top < right.bottom && left.bottom > right.top;
}

function installProjectedReadingDiagnostics() {
    window.__yomuProjectedReadingDiagnostics = root => {
        const visible = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 0
                && rect.height > 0;
        };
        // Pierce open shadow roots so document-level associations cover the
        // fixture's web-component sources (join/sort/feed) too.
        const collectSources = node => [
            ...node.querySelectorAll('.jpdb-reader-detached-furi:not([data-yomu-projected-reading="true"])'),
            ...[...node.querySelectorAll('*')]
                .filter(element => element.shadowRoot)
                .flatMap(element => collectSources(element.shadowRoot)),
        ];
        const sources = collectSources(root);
        const clones = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')];
        const available = new Set(clones.filter(visible));
        const associations = [];
        for (const source of sources) {
            const base = source.closest('.jpdb-reader-detached-ruby')
                ?? source.closest('.jpdb-reader-word');
            if (!base) continue;
            const baseRect = base.getBoundingClientRect();
            const candidate = [...available]
                .filter(clone => clone.textContent === source.textContent)
                .map(clone => {
                    const rect = clone.getBoundingClientRect();
                    return {
                        clone,
                        score: Math.abs((rect.left + rect.right - baseRect.left - baseRect.right) / 2)
                            + Math.abs(rect.bottom - baseRect.top),
                    };
                })
                .sort((left, right) => left.score - right.score)
                // A genuine projection sits directly above its base word. Without
                // this cap, a word whose own clone is missing would steal a
                // same-text clone from an unrelated row (sort's 賛成票 matching
                // the metadata row's 賛成票).
                .filter(entry => entry.score <= 48)[0]?.clone;
            if (!candidate) continue;
            available.delete(candidate);
            const cloneRect = candidate.getBoundingClientRect();
            const word = source.closest('.jpdb-reader-word');
            associations.push({
                source,
                clone: candidate,
                base,
                sourceSurface: word?.dataset.surface ?? word?.dataset.expression ?? '',
                sourceRange: `${word?.dataset.tokenStart ?? ''}:${word?.dataset.tokenEnd ?? ''}`,
                centerDelta: (cloneRect.left + cloneRect.right - baseRect.left - baseRect.right) / 2,
                baselineDelta: cloneRect.bottom - baseRect.top,
            });
        }
        return { sources, clones, associations, visible };
    };
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
    const award = document.querySelector('reddit-award-button').shadowRoot.querySelector('#award-control');
    const create = document.querySelector('#create-post');
    const share = document.querySelector('#share');
    return {
        createHeight: create.getBoundingClientRect().height,
        awardHeight: award.getBoundingClientRect().height,
        shareHeight: share.getBoundingClientRect().height,
        cardHeight: card.height,
        cardToPostGap: post.top - card.bottom,
        joinTextCenterOffset: nativeTextCenterOffset(join),
        sortTextCenterOffset: nativeTextCenterOffset(sort),
        controlBoxes: {
            create: boxGeometry(create),
            award: boxGeometry(award),
            share: boxGeometry(share),
            join: boxGeometry(join),
            sort: boxGeometry(sort),
        },
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

    function boxGeometry(element) {
        return {
            overflow: getComputedStyle(element).overflow,
            inlineOverflow: element.style.getPropertyValue('overflow'),
            client: [element.clientWidth, element.clientHeight],
            scroll: [element.scrollWidth, element.scrollHeight],
        };
    }
}

async function snapshotRedditRegression(page) {
    const backgroundSpecs = {
        create: ['#create-post', '投稿を作成'],
        join: ['#join', '参加'],
        feed: ['#feed', 'フィード'],
        sort: ['#sort', '賛成票率順'],
        flair: ['#flair', '告知'],
        metadata: ['#card-metadata', '賛成票・コメント'],
        time: ['#post-meta', '時間前'],
        award: ['#award-control', 'アワードを贈る'],
        share: ['#share', '共有'],
        foreign: ['#foreign-jp', '共有'],
        lateJoin: ['#late-join', '参加'],
        lateHydrate: ['#late-hydrate', 'フィード'],
        lateUpgrade: ['#late-upgrade', '並べ替え基準'],
    };
    const menuSpecs = {
        menuHeading: ['#menu-heading', '並べ替え基準'],
        menuHot: ['#menu-hot', '注目順'],
        menuNew: ['#menu-new', '新しい順'],
        menuVotes: ['#menu-votes', '賛成票数順'],
    };
    const menuLabelEntries = await Promise.all(Object.entries(menuSpecs).map(async ([name, [selector, expected]]) => [
        name,
        await page.locator(selector).evaluate(snapshotRedditElement, expected),
    ]));
    const menuSafety = await page.locator('reddit-sort-control').evaluate(snapshotSortMenuSafety);

    await page.evaluate(async () => {
        document.querySelector('reddit-sort-control').shadowRoot.querySelector('#sort-menu').hidden = true;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const backgroundLabelEntries = await Promise.all(Object.entries(backgroundSpecs).map(async ([name, [selector, expected]]) => [
        name,
        await page.locator(selector).evaluate(snapshotRedditElement, expected),
    ]));
    const [subreddit, punctuation, summary] = await Promise.all([
        page.locator('#subreddit').evaluate(snapshotRedditElement, null),
        page.locator('#punctuation').evaluate(snapshotRedditElement, null),
        page.evaluate(snapshotRedditPageSummary),
    ]);
    return {
        labels: Object.fromEntries([...backgroundLabelEntries, ...menuLabelEntries]),
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
    const nativeStyle = getComputedStyle(element);
    const paintIsVisible = value => Boolean(value) && value !== 'transparent'
        && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)
        && !/\/\s*0(?:\.0+)?%?\s*\)$/.test(value);
    const effectiveNativePaint = nativeStyle.webkitTextFillColor || nativeStyle.color;
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
    const projection = window.__yomuProjectedReadingDiagnostics(element);
    const readings = projection.sources;
    const projectedReadings = projection.associations.map(association => association.clone);
    const visibleReadings = projectedReadings.filter(projection.visible);
    const decoratedWords = words.filter(word => {
        const surfaces = [word, ...word.querySelectorAll('.jpdb-reader-source-fragment')];
        return surfaces.some(surface => {
            const style = getComputedStyle(surface);
            const nativeUnderline = style.textDecorationLine.includes('underline')
                && paintIsVisible(style.textDecorationColor);
            const underline = getComputedStyle(surface, '::after');
            const borderStyle = underline.getPropertyValue('border-block-end-style') || underline.borderBottomStyle;
            const borderWidth = Number.parseFloat(
                underline.getPropertyValue('border-block-end-width') || underline.borderBottomWidth,
            );
            const borderColor = underline.getPropertyValue('border-block-end-color') || underline.borderBottomColor;
            return nativeUnderline || (borderStyle !== 'none' && borderWidth > 0 && paintIsVisible(borderColor));
        });
    });
    return {
        expected,
        visibleText,
        height: rect.height,
        wordCount: words.length,
        pitchWordCount: words.filter(word => Boolean(word.dataset.pitchClass && word.dataset.pitchClass !== 'unknown')).length,
        pitchExpressions: words
            .filter(word => Boolean(word.dataset.pitchClass && word.dataset.pitchClass !== 'unknown'))
            .map(word => word.getAttribute('data-expression')),
        statusWordCount: words.filter(word => word.matches([
            '.jpdb-not-in-deck', '.jpdb-learning', '.jpdb-young', '.jpdb-known',
            '.jpdb-mature', '.jpdb-mastered', '.jpdb-never-forget', '.jpdb-redundant', '.jpdb-due',
        ].join(','))).length,
        decoratedExpressions: decoratedWords.map(word => word.getAttribute('data-expression')),
        expectedKanji: [...String(expected ?? '').matchAll(/[\u3400-\u9fff]/gu)].map(match => match[0]).join(''),
        pitchKanji: words
            .filter(word => Boolean(word.dataset.pitchClass && word.dataset.pitchClass !== 'unknown'))
            .flatMap(word => [...String(word.getAttribute('data-expression') ?? '').matchAll(/[\u3400-\u9fff]/gu)])
            .map(match => match[0])
            .join(''),
        decoratedKanji: decoratedWords
            .flatMap(word => [...String(word.getAttribute('data-expression') ?? '').matchAll(/[\u3400-\u9fff]/gu)])
            .map(match => match[0])
            .join(''),
        projectedFragments: words.flatMap(word => [...word.querySelectorAll('.jpdb-reader-source-fragment')])
            .map(fragment => {
                const underline = getComputedStyle(fragment, '::after');
                return {
                    borderStyle: underline.getPropertyValue('border-block-end-style') || underline.borderBottomStyle,
                    borderWidth: underline.getPropertyValue('border-block-end-width') || underline.borderBottomWidth,
                    borderColor: underline.getPropertyValue('border-block-end-color') || underline.borderBottomColor,
                    underline: getComputedStyle(fragment).getPropertyValue('--jpdb-reader-word-underline'),
                    rect: fragment.getBoundingClientRect().toJSON(),
                };
            }),
        nativePaintVisible: nativeStyle.display !== 'none'
            && nativeStyle.visibility !== 'hidden'
            && nativeStyle.opacity !== '0'
            && paintIsVisible(effectiveNativePaint),
        expressions: words.map(word => word.getAttribute('data-expression')),
        readingCount: readings.length,
        projectedReadingCount: projectedReadings.length,
        visibleReadingCount: visibleReadings.length,
        sourceReadingVisibleCount: readings.filter(projection.visible).length,
        hiddenReadingCount: readings.length - projectedReadings.length,
        readingTexts: readings.map(reading => reading.textContent ?? ''),
        projectedReadings: projection.associations.map(association => ({
            text: association.clone.textContent ?? '',
            sourceSurface: association.sourceSurface,
            sourceRange: association.sourceRange,
            centerDelta: association.centerDelta,
            baselineDelta: association.baselineDelta,
        })),
        nativeRubyCount: element.querySelectorAll('rt').length,
        readingClipped: projectedReadings.some(readingIsClipped),
        readingClipAncestors: projectedReadings.flatMap(readingClipAncestors),
        readingBaseOverlap: readingBaseOverlap(projection.associations),
        readingStyles: projection.associations.map(association => ({
            transform: getComputedStyle(association.clone).transform,
            rect: association.clone.getBoundingClientRect().toJSON(),
            sourceRect: association.base.getBoundingClientRect().toJSON(),
        })),
        overflow: getComputedStyle(element).overflow,
        inlineOverflow: element.style.getPropertyValue('overflow'),
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

    function readingBaseOverlap(associations) {
        let overlap = 0;
        for (const { clone, base } of associations) {
            const reading = clone.getBoundingClientRect();
            const source = base.getBoundingClientRect();
            const width = Math.min(reading.right, source.right) - Math.max(reading.left, source.left);
            const height = Math.min(reading.bottom, source.bottom) - Math.max(reading.top, source.top);
            if (width > 0.5 && height > 0.5) overlap = Math.max(overlap, height);
        }
        return overlap;
    }
}

function snapshotSortMenuSafety(host) {
    const menu = host.shadowRoot.querySelector('#sort-menu');
    const projection = window.__yomuProjectedReadingDiagnostics(menu);
    const documentProjection = window.__yomuProjectedReadingDiagnostics(document);
    const readings = projection.sources;
    const visible = projection.associations.map(association => association.clone)
        .filter(projection.visible);
    const menuClones = new Set(projection.associations.map(association => association.clone));
    const menuRect = menu.getBoundingClientRect();
    const backgroundReadingLeaks = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')]
        .filter(clone => !menuClones.has(clone)
            && projection.visible(clone)
            && rectanglesOverlap(clone.getBoundingClientRect(), menuRect));
    let readingBaseOverlap = 0;
    let readingReadingOverlap = 0;
    for (const { clone, base } of projection.associations) {
        const readingRect = clone.getBoundingClientRect();
        const baseRect = base.getBoundingClientRect();
        const width = Math.min(readingRect.right, baseRect.right) - Math.max(readingRect.left, baseRect.left);
        const height = Math.min(readingRect.bottom, baseRect.bottom) - Math.max(readingRect.top, baseRect.top);
        if (width > 0.5 && height > 0.5) readingBaseOverlap = Math.max(readingBaseOverlap, height);
    }
    for (let index = 0; index < visible.length; index += 1) {
        for (let other = index + 1; other < visible.length; other += 1) {
            if (rectanglesOverlap(visible[index].getBoundingClientRect(), visible[other].getBoundingClientRect())) {
                readingReadingOverlap += 1;
            }
        }
    }
    return {
        wordCount: menu.querySelectorAll('.jpdb-reader-word').length,
        openProjectedReadingCloneCount: documentProjection.clones.length,
        openVisibleProjectedReadingCloneCount: documentProjection.clones.filter(documentProjection.visible).length,
        readingCount: readings.length,
        projectedReadingCount: projection.associations.length,
        visibleReadingCount: visible.length,
        sourceReadingVisibleCount: readings.filter(projection.visible).length,
        hiddenReadingCount: readings.length - projection.associations.length,
        readingTexts: readings.map(reading => reading.textContent ?? ''),
        projectedReadings: projection.associations.map(association => ({
            text: association.clone.textContent ?? '',
            sourceSurface: association.sourceSurface,
            sourceRange: association.sourceRange,
            centerDelta: association.centerDelta,
            baselineDelta: association.baselineDelta,
        })),
        readingBaseOverlap,
        readingReadingOverlap,
        backgroundReadingLeakCount: backgroundReadingLeaks.length,
        backgroundReadingLeakTexts: backgroundReadingLeaks.map(reading => reading.textContent ?? ''),
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
    const projection = window.__yomuProjectedReadingDiagnostics(mirror ?? element);
    const readings = projection.sources;
    const projected = projection.associations.map(association => association.clone);
    const paintIsVisible = value => value !== 'transparent'
        && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value)
        && !/\/\s*0(?:\.0+)?%?\s*\)$/.test(value);
    const readingBaseOverlap = projection.associations.reduce((overlap, { clone, base }) => {
        const reading = clone.getBoundingClientRect();
        const source = base.getBoundingClientRect();
        const width = Math.min(reading.right, source.right) - Math.max(reading.left, source.left);
        const height = Math.min(reading.bottom, source.bottom) - Math.max(reading.top, source.top);
        return width > 0.5 && height > 0.5 ? Math.max(overlap, height) : overlap;
    }, 0);
    return {
        height: element.getBoundingClientRect().height,
        mirrorVisibility: mirror ? getComputedStyle(mirror).visibility : '',
        visibleRuby: projected.filter(projection.visible).length,
        detachedReadings: readings.length,
        projectedReadings: projection.associations.length,
        sourceReadingVisibleCount: readings.filter(projection.visible).length,
        projectedAssociations: projection.associations.map(association => ({
            text: association.clone.textContent ?? '',
            sourceSurface: association.sourceSurface,
            sourceRange: association.sourceRange,
            centerDelta: association.centerDelta,
            baselineDelta: association.baselineDelta,
        })),
        readingBaseOverlap,
        wordWhiteSpace: mirror?.querySelector('.jpdb-reader-word') ? getComputedStyle(mirror.querySelector('.jpdb-reader-word')).whiteSpace : '',
        mirrorClientWidth: mirror?.clientWidth ?? 0,
        mirrorScrollWidth: mirror?.scrollWidth ?? 0,
        overflow: style.overflow,
        inlineOverflow: element.style.getPropertyValue('overflow'),
        client: [element.clientWidth, element.clientHeight],
        scroll: [element.scrollWidth, element.scrollHeight],
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
    const join = document.querySelector('reddit-header-shell').shadowRoot
        .querySelector('reddit-join-control').shadowRoot.querySelector('#join');
    const sort = document.querySelector('reddit-sort-control').shadowRoot.querySelector('#sort');
    const award = document.querySelector('reddit-award-button').shadowRoot.querySelector('#award-control');
    const pageScale = outerWidth / innerWidth;
    const rawPuckRect = puck.getBoundingClientRect();
    const measuredPuckScale = puck.offsetWidth ? rawPuckRect.width / puck.offsetWidth : 1;
    const compensatedRectScale = pageScale > 1
        && Math.abs(measuredPuckScale - 1 / pageScale) < Math.abs(measuredPuckScale - 1)
        ? pageScale
        : 1;
    const puckRect = scalePlainRect(rawPuckRect, compensatedRectScale);
    const radialItems = [...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
    const radialRects = radialItems.map(item => scalePlainRect(item.getBoundingClientRect(), compensatedRectScale));
    const radialCenters = radialRects.map(rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    const visualViewportBottom = ((visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? innerHeight)) * pageScale;
    const readingProjection = window.__yomuProjectedReadingDiagnostics(document);
    return {
        layout: {
            fixture: document.documentElement.dataset.yomuFixture,
            createHeight: document.querySelector('#create-post').getBoundingClientRect().height,
            awardHeight: award.getBoundingClientRect().height,
            shareHeight: document.querySelector('#share').getBoundingClientRect().height,
            cardHeight: card.height,
            cardToPostGap: post.top - card.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            browserWidth: outerWidth,
            browserToLayoutScale: pageScale,
            visualViewportScale: visualViewport?.scale ?? null,
            scrollWidth: document.documentElement.scrollWidth,
            rubyRoomCount: document.querySelectorAll('[data-yomu-ruby-room]').length,
            projectedReadingCloneCount: readingProjection.clones.length,
            visibleProjectedReadingCloneCount: readingProjection.clones.filter(readingProjection.visible).length,
            hiddenProjectedReadingCloneCount: readingProjection.clones.filter(
                clone => !readingProjection.visible(clone),
            ).length,
            // A visible clone with no live source association is a leak (a
            // closed menu's clone left painted, or a duplicate).
            orphanVisibleProjectedReadingCloneCount: readingProjection.clones.filter(readingProjection.visible).length
                - readingProjection.associations.length,
            // Readings are split across a viewport layer and a document-space
            // layer by scroll context; exactly one of each must ever exist.
            viewportReadingLayerCount: document.querySelectorAll(
                '.jpdb-reader-detached-reading-overlay:not(.jpdb-reader-detached-reading-document-layer)',
            ).length,
            documentReadingLayerCount: document.querySelectorAll(
                '.jpdb-reader-detached-reading-document-layer',
            ).length,
            controlBoxes: {
                create: boxGeometry(document.querySelector('#create-post')),
                award: boxGeometry(award),
                share: boxGeometry(document.querySelector('#share')),
                join: boxGeometry(join),
                sort: boxGeometry(sort),
            },
        },
        overlay: {
            hostname: location.hostname,
            bodyZoom: getComputedStyle(document.body).zoom,
            puckZoom: getComputedStyle(puck).zoom,
            puckInlineZoom: puck.style.getPropertyValue('zoom'),
            puckZoomPriority: puck.style.getPropertyPriority('zoom'),
            scaleAdapter: puck.dataset.jpdbReaderScaleAdapter ?? '',
            stampedPageScale: Number(puck.dataset.jpdbReaderPageScale || 1),
            stampedCompensation: Number(puck.dataset.jpdbReaderScaleCompensation || 1),
            compensatedRectScale,
            rawPuckWidth: rawPuckRect.width,
            puckWidth: puckRect.width,
            puckHeight: puckRect.height,
            puckRightGap: outerWidth - puckRect.right,
            puckBottomGap: visualViewportBottom - puckRect.bottom,
            puckLayoutBottomGap: innerHeight * pageScale - puckRect.bottom,
            puckComputedBottom: getComputedStyle(puck).bottom,
            rawPuckRect: scalePlainRect(rawPuckRect, 1),
            outerHeight,
            documentClientHeight: document.documentElement.clientHeight,
            visualViewport: visualViewport ? {
                width: visualViewport.width,
                height: visualViewport.height,
                scale: visualViewport.scale,
                offsetTop: visualViewport.offsetTop,
            } : null,
            radialWidths: radialRects.map(rect => rect.width),
            adjacentDistances: radialCenters.slice(1).map((center, index) => Math.hypot(
                center.x - radialCenters[index].x,
                center.y - radialCenters[index].y,
            )),
        },
        clicks: window.__redditSmokeClicks,
    };

    function scalePlainRect(rect, scale) {
        return {
            left: rect.left * scale,
            top: rect.top * scale,
            right: rect.right * scale,
            bottom: rect.bottom * scale,
            width: rect.width * scale,
            height: rect.height * scale,
        };
    }

    function boxGeometry(element) {
        return {
            overflow: getComputedStyle(element).overflow,
            inlineOverflow: element.style.getPropertyValue('overflow'),
            client: [element.clientWidth, element.clientHeight],
            scroll: [element.scrollWidth, element.scrollHeight],
        };
    }
}

function radialGeometryHasSettled() {
    const items = [...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
    if (items.length < 6) return false;
    const rects = items.map(item => item.getBoundingClientRect());
    const centers = rects.map(rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
    return rects.every(rect => rect.width >= 45 && rect.width <= 51)
        && centers.slice(1).every((center, index) => Math.hypot(
            center.x - centers[index].x,
            center.y - centers[index].y,
        ) >= 60);
}

function assertRedditRegression(engineName, baseline, snapshot, touchHover, pageErrors) {
    assert(pageErrors.length === 0, `${engineName}: page errors during Reddit smoke`, { pageErrors, snapshot });
    assert(snapshot.layout.fixture === 'deterministic-reddit-structure',
        `${engineName}: browser artifact was not labelled as a deterministic fixture`, snapshot.layout);
    assert(snapshot.overlay.hostname === 'www.reddit.com', `${engineName}: Reddit scale fixture lost its production hostname`, snapshot.overlay);
    if (engineName === 'webkit') {
        assert(Math.abs(snapshot.layout.browserToLayoutScale - 1.6) <= 0.01,
            `${engineName}: fixture did not reproduce Safari's page-view scale`, snapshot.layout);
        assert(snapshot.overlay.scaleAdapter === 'apple-touch-page-scale'
            && Math.abs(snapshot.overlay.stampedPageScale - 1.6) <= 0.01
            && Math.abs(snapshot.overlay.stampedCompensation - 0.625) <= 0.01,
        `${engineName}: Reddit page-scale adapter did not stamp its active compensation`, snapshot.overlay);
        assert(snapshot.overlay.puckInlineZoom === '0.625' && snapshot.overlay.puckZoomPriority === 'important',
            `${engineName}: puck did not receive inverse page-scale isolation`, snapshot.overlay);
    } else {
        assert(Math.abs(snapshot.layout.browserToLayoutScale - 1) <= 0.01,
            `${engineName}: normal-scale compatibility lane unexpectedly changed viewport scale`, snapshot.layout);
        assert(snapshot.overlay.scaleAdapter === '' && snapshot.overlay.puckInlineZoom === '',
            `${engineName}: normal-scale Reddit received unnecessary compensation`, snapshot.overlay);
    }
    // The open hub deliberately grows to 1.06× (52 × 1.06 = 55.12px). It must
    // stay that physical size even when WebKit renders the page itself at 1.6×.
    assert(Math.abs(snapshot.overlay.puckWidth - 55.12) <= 1 && Math.abs(snapshot.overlay.puckHeight - 55.12) <= 1,
        `${engineName}: Reddit page scale enlarged the Yomu puck`, snapshot.overlay);
    // Headless Linux WebKit applies CSS zoom to a fixed bottom edge
    // differently from Safari/WebKit on macOS. Keep that synthetic lane strict
    // about full visibility and the authored edge rule; real Safari and every
    // other lane must retain the full physical margin.
    const minimumPuckBottomGap = isLinuxWebKitPort(engineName) ? 0 : 8;
    assert(snapshot.overlay.puckRightGap >= 8 && snapshot.overlay.puckRightGap <= 24
        && snapshot.overlay.puckBottomGap >= minimumPuckBottomGap && snapshot.overlay.puckBottomGap <= 24,
    `${engineName}: compensated puck left the visible browser viewport`, snapshot.overlay);
    if (isLinuxWebKitPort(engineName)) {
        assert(snapshot.overlay.puckComputedBottom === '14px',
            `${engineName}: compensated puck lost its authored bottom edge rule`, snapshot.overlay);
    }
    assert(snapshot.overlay.radialWidths.length >= 6
        && snapshot.overlay.radialWidths.every(width => width >= 45 && width <= 51),
    `${engineName}: Reddit page scale enlarged the Yomu radial controls`, snapshot.overlay);
    assert(Math.min(...snapshot.overlay.adjacentDistances) >= 60,
        `${engineName}: Reddit scale isolation collapsed radial finger spacing`, snapshot.overlay);
    assertOverlayScaleIsolation(engineName, snapshot.overlay);
    assertAnnotatedLabels(engineName, snapshot.labels);
    assertRejectedSourceRanges(engineName, snapshot.rejected);
    assertStableFixtureLayout(engineName, baseline, snapshot.layout, snapshot.menuSafety);
    assertSortMenuSafety(engineName, snapshot.menuSafety);
    assertForeignTextVisibility(engineName, snapshot.labels.foreign);
    assertControlBehavior(engineName, baseline, snapshot);
    assertCoarsePointerSafety(engineName, touchHover);
}

function assertOverlayScaleIsolation(engineName, overlay) {
    assert(overlay.hostname === 'www.reddit.com', `${engineName}: Reddit scale fixture lost its production hostname`, overlay);
    // The open hub deliberately grows to 1.06×; the host's 1.6× zoom must not
    // multiply that again (52 × 1.06 = 55.12px).
    assert(Math.abs(overlay.puckWidth - 55.12) <= 1 && Math.abs(overlay.puckHeight - 55.12) <= 1,
        `${engineName}: Reddit host zoom enlarged the Yomu puck`, overlay);
    assert(overlay.radialWidths.length >= 6
        && overlay.radialWidths.every(width => width >= 45 && width <= 51),
    `${engineName}: Reddit host zoom enlarged the Yomu radial controls`, overlay);
    assert(Math.min(...overlay.adjacentDistances) >= 60,
        `${engineName}: Reddit scale isolation collapsed radial finger spacing`, overlay);
}

function assertAnnotatedLabels(engineName, labels) {
    for (const [name, label] of Object.entries(labels)) {
        assert(label.wordCount > 0, `${engineName}: ${name} was not annotated`, label);
        if (/[\u3400-\u9fff]/.test(label.expected)) {
            assert(label.readingCount > 0, `${engineName}: ${name} is missing furigana`, label);
        }
        if (name === 'feed' || name === 'lateHydrate') {
            assert(label.readingCount === 0, `${engineName}: ${name} duplicated an identical kana reading`, label);
        }
        assert(label.sourceReadingVisibleCount === 0,
            `${engineName}: ${name} source furigana entered page layout`, label);
        assert(label.projectedReadingCount === label.readingCount
            && label.visibleReadingCount === label.projectedReadingCount,
        `${engineName}: ${name} lost a projected furigana clone`, label);
        assert(projectedReadingsHaveSourceRanges(label.projectedReadings),
            `${engineName}: ${name} projected furigana lost its source range`, label);
        assert(projectedReadingsAreAligned(label.projectedReadings),
            `${engineName}: ${name} projected furigana drifted from its source`, label);
        const expectedPitchExpressions = label.expressions.filter(expression => MOCK_PITCH_EXPRESSIONS.has(expression));
        assert(expectedPitchExpressions.length > 0,
            `${engineName}: ${name} fixture has no pitch-bearing lexical expression`, label);
        assert(expectedPitchExpressions.every(expression => label.pitchExpressions.includes(expression)),
            `${engineName}: ${name} is missing concrete lexical pitch state`, label);
        assert(label.statusWordCount === label.wordCount,
            `${engineName}: ${name} is missing vocabulary status state`, label);
        assert(expectedPitchExpressions.every(expression => label.decoratedExpressions.includes(expression)),
            `${engineName}: ${name} pitch/status decoration is not visibly painted`, label);
        if (label.expectedKanji) {
            assert(label.pitchKanji === label.expectedKanji,
                `${engineName}: ${name} has only partial lexical pitch coverage`, label);
            assert(label.decoratedKanji === label.expectedKanji,
                `${engineName}: ${name} has only partial visible underline coverage`, label);
        }
        assert(label.nativePaintVisible, `${engineName}: ${name} lost its native source paint`, label);
        assert(label.nativeRubyCount === 0, `${engineName}: ${name} gained layout-changing native ruby`, label);
        assert(label.readingClipped === false, `${engineName}: ${name} furigana is clipped`, label);
        assert(label.readingBaseOverlap <= MAX_FONT_BOX_CONTACT_PX,
            `${engineName}: ${name} furigana intrudes into base text`, label);
        assert(label.hiddenReadingCount === 0,
            `${engineName}: ${name} has source furigana without projected paint`, label);
        assert(label.rubyRoomCount === 0, `${engineName}: ${name} reserved ruby room`, label);
        assert(label.visibleWords, `${engineName}: ${name} annotation base is clipped or invisible`, label);
        for (const fragment of label.expected.split('・')) {
            assert(label.visibleText.includes(fragment), `${engineName}: ${name} lost visible base text "${fragment}"`, label);
        }
    }
    // Chrome buttons and metadata rows alike keep every parsed reading painted
    // at rest — the point of the whole tier is layout safety, not hiding.
    for (const name of ['create', 'join', 'sort', 'award', 'share', 'time']) {
        const label = labels[name];
        assert(label.readingCount > 0
            && label.projectedReadingCount === label.readingCount
            && label.visibleReadingCount === label.projectedReadingCount,
            `${engineName}: ${name} is not annotated at rest`, label);
    }
}

function assertRejectedSourceRanges(engineName, rejected) {
    assert(rejected.subredditWords === 0, `${engineName}: Latin-only r/singularity was annotated`, rejected);
    assert(rejected.punctuationWords === 0, `${engineName}: punctuation-only range was annotated`, rejected);
    assert(rejected.subredditText === 'r/singularity' && rejected.punctuationText === '…', `${engineName}: rejected source text changed`, rejected);
}

function assertStableFixtureLayout(engineName, baseline, layout, menuSafety) {
    assert(Math.abs(layout.createHeight - baseline.createHeight) <= 1, `${engineName}: create button height changed`, { baseline, layout });
    assert(Math.abs(layout.awardHeight - baseline.awardHeight) <= 1, `${engineName}: award button height changed`, { baseline, layout });
    assert(Math.abs(layout.shareHeight - baseline.shareHeight) <= 1, `${engineName}: share button height changed`, { baseline, layout });
    assert(Math.abs(layout.cardHeight - baseline.cardHeight) <= 1, `${engineName}: highlight card grew`, { baseline, layout });
    assert(layout.cardToPostGap <= baseline.cardToPostGap + 2, `${engineName}: a large gap appeared below the card`, { baseline, layout });
    assert(layout.scrollWidth <= layout.viewportWidth + 2, `${engineName}: annotations caused horizontal overflow`, layout);
    assert(layout.rubyRoomCount === 0, `${engineName}: Reddit fixture received ruby-room growth`, layout);
    // Closing the menu restores background readings it had occluded, and the
    // menu's own clones may be either retained hidden or dropped, so per-count
    // identities between the open and closed snapshots do not hold. The leak
    // contract is instead: the clone pool either kept or dropped exactly the menu's
    // clones, every clone still visible is associated with a live source
    // (a closed menu's clone left painted has none), and content rows still
    // project readings at rest.
    const retainedHiddenMenuClones = layout.projectedReadingCloneCount === menuSafety.openProjectedReadingCloneCount;
    const removedMenuClones = layout.projectedReadingCloneCount
        === menuSafety.openProjectedReadingCloneCount - menuSafety.projectedReadingCount;
    assert(layout.visibleProjectedReadingCloneCount > 0
        && layout.orphanVisibleProjectedReadingCloneCount === 0
        && menuSafety.projectedReadingCount > 0
        && (retainedHiddenMenuClones || removedMenuClones)
        && layout.viewportReadingLayerCount === 1
        && layout.documentReadingLayerCount === 1,
    `${engineName}: closed menu did not reach an atomic projected reading inventory`, {
        layout,
        menuSafety,
    });
    for (const name of ['create', 'award', 'share', 'join', 'sort']) {
        assert(boxGeometryMatches(baseline.controlBoxes[name], layout.controlBoxes[name]),
            `${engineName}: ${name} changed authored overflow or scroll geometry`, {
                before: baseline.controlBoxes[name],
                after: layout.controlBoxes[name],
            });
    }
}

function assertSortMenuSafety(engineName, menuSafety) {
    assert(menuSafety.wordCount >= 4, `${engineName}: dynamically revealed shadow menu was not annotated`, menuSafety);
    assert(menuSafety.sourceReadingVisibleCount === 0
        && menuSafety.hiddenReadingCount === 0
        && menuSafety.projectedReadingCount === menuSafety.readingCount
        && menuSafety.visibleReadingCount === menuSafety.projectedReadingCount,
    `${engineName}: a realistically spaced opaque menu lost projected furigana`, menuSafety);
    assert(projectedReadingsHaveSourceRanges(menuSafety.projectedReadings),
        `${engineName}: sort-menu projected furigana lost its source range`, menuSafety);
    assert(projectedReadingsAreAligned(menuSafety.projectedReadings),
        `${engineName}: sort-menu projected furigana drifted from its source`, menuSafety);
    assert(menuSafety.readingBaseOverlap <= MAX_FONT_BOX_CONTACT_PX && menuSafety.readingReadingOverlap === 0,
        `${engineName}: visible menu furigana intrudes into another reading or base line`, menuSafety);
    assert(menuSafety.backgroundReadingLeakCount === 0,
        `${engineName}: a page reading painted through the opaque sort menu`, menuSafety);
    assert(menuSafety.readingTexts.every(text => text && !text.includes('…') && !text.includes('...')),
        `${engineName}: unsafe furigana was truncated instead of preserved in full`, menuSafety);
}

function assertForeignTextVisibility(engineName, foreignLabel) {
    assert(foreignLabel.sourceReadingVisibleCount === 0
        && foreignLabel.projectedReadingCount === foreignLabel.readingCount
        && foreignLabel.visibleReadingCount === foreignLabel.projectedReadingCount
        && foreignLabel.hiddenReadingCount === 0,
    `${engineName}: adjacent foreign text caused passive furigana to disappear`, foreignLabel);
    assert(foreignLabel.pitchWordCount > 0,
        `${engineName}: foreign-text adjacency removed pitch annotation`, foreignLabel);
}

function assertControlBehavior(engineName, baseline, snapshot) {
    assert(Object.values(snapshot.clicks).every(count => count === 1), `${engineName}: an annotated control stopped receiving clicks`, snapshot.clicks);
    assert(Math.abs(snapshot.labels.join.wordCenterOffset - baseline.joinTextCenterOffset) <= 2,
        `${engineName}: mirrored Join label moved away from its native vertical alignment`, { baseline, join: snapshot.labels.join });
    assert(Math.abs(snapshot.labels.sort.wordCenterOffset - baseline.sortTextCenterOffset) <= 2,
        `${engineName}: mirrored sort label moved away from its native vertical alignment`, { baseline, sort: snapshot.labels.sort });
}

function assertCoarsePointerSafety(engineName, touchHover) {
    assertCoarsePointerInventory(engineName, touchHover);
    assertCoarsePointerReadingSafety(engineName, touchHover);
    assertCoarsePointerFallback(engineName, touchHover);
    assertCoarsePointerGeometry(engineName, touchHover);
}

function assertCoarsePointerInventory(engineName, touchHover) {
    assert(touchHover.mirrorWords > 0 && touchHover.mirrorPitchWords > 0 && touchHover.mirrorRuby > 0,
        `${engineName}: touch fixture did not retain its annotated mirror`, touchHover);
    assert(touchHover.before.mirrorVisibility === 'visible' && touchHover.hovered.mirrorVisibility === 'visible',
        `${engineName}: coarse-pointer annotations still depend on a sticky hover transition`, touchHover);
}

function assertCoarsePointerReadingSafety(engineName, touchHover) {
    assert(touchHover.before.detachedReadings > 0
        && ['before', 'hovered', 'after'].every(state => allReadingsVisible(touchHover[state])
            && projectedReadingsHaveSourceRanges(touchHover[state].projectedAssociations)),
    `${engineName}: coarse-pointer mirror lost detached readings`, touchHover);
    assert(touchHover.hovered.visibleRuby === touchHover.before.visibleRuby
        && touchHover.after.visibleRuby === touchHover.before.visibleRuby,
    `${engineName}: coarse-pointer detached readings changed across sticky hover`, touchHover);
    assert(touchHover.before.readingBaseOverlap <= MAX_FONT_BOX_CONTACT_PX
        && touchHover.hovered.readingBaseOverlap <= MAX_FONT_BOX_CONTACT_PX,
    `${engineName}: coarse-pointer furigana intrudes into base text`, touchHover);
}

function assertCoarsePointerFallback(engineName, touchHover) {
    assert(['before', 'hovered', 'after'].every(state => nativeFallbackIsVisible(touchHover[state])),
        `${engineName}: additive mirror hid the native fallback text`, touchHover);
}

function assertCoarsePointerGeometry(engineName, touchHover) {
    assert(Math.abs(touchHover.hovered.height - touchHover.before.height) <= 1
        && Math.abs(touchHover.after.height - touchHover.before.height) <= 1,
    `${engineName}: coarse-pointer hover changed row geometry`, touchHover);
    assert(boxGeometryMatches(touchHover.before, touchHover.hovered)
        && boxGeometryMatches(touchHover.before, touchHover.after),
    `${engineName}: coarse-pointer hover changed authored overflow or scroll geometry`, touchHover);
}

function isLinuxWebKitPort(engineName) {
    return engineName === 'webkit' && process.platform === 'linux';
}

function allReadingsVisible(state) {
    return state.sourceReadingVisibleCount === 0
        && state.projectedReadings === state.detachedReadings
        && state.visibleRuby === state.projectedReadings;
}

function projectedReadingsHaveSourceRanges(readings) {
    return readings.every(reading => {
        const match = /^(\d+):(\d+)$/u.exec(reading.sourceRange);
        return Boolean(match) && Number(match[2]) > Number(match[1]);
    });
}

function projectedReadingsAreAligned(readings) {
    // The production crowding solver may nudge an edge reading a few pixels so
    // neighbouring kana do not collide. Source-range, overlap, clipping and
    // baseline assertions still catch a clone associated with the wrong word.
    const centerTolerance = 3;
    return readings.every(reading => Math.abs(reading.centerDelta) <= centerTolerance
        && Math.abs(reading.baselineDelta) <= 1);
}

function boxGeometryMatches(before, after) {
    return Boolean(before && after)
        && before.overflow === after.overflow
        && before.inlineOverflow === after.inlineOverflow
        && before.client[0] === after.client[0]
        && before.client[1] === after.client[1]
        && before.scroll[0] === after.scroll[0]
        && before.scroll[1] === after.scroll[1];
}

function nativeFallbackIsVisible(state) {
    return state.hostVisibility !== 'hidden' && state.hostPaintVisible;
}
