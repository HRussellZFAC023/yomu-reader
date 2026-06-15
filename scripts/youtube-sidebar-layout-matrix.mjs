#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath, cssPath, root, artifacts } = createSmokePaths(import.meta.dirname);
const companionDir = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_COMPANION_DIR ?? join(root, 'dist/greasyfork'));
const companionPaths = ['yomu-anki.user.js', 'yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => join(companionDir, name))
    .filter(existsSync);
const outputDir = resolve(process.env.YOMU_YOUTUBE_SIDEBAR_OUTPUT_DIR ?? join(artifacts, 'youtube-sidebar-matrix', 'working'));
const headed = process.env.YOMU_YOUTUBE_SIDEBAR_HEADED === '1';
const placements = ['right', 'left', 'bottom'];
const viewports = [
    { name: 'ipad-pro-portrait', viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'mobile-iphone-13', ...devices['iPhone 13'] },
    { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

assertBuiltArtifacts([scriptPath, cssPath], root);
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: !headed });
const results = [];
try {
    for (const viewport of viewports) {
        for (const placement of placements) {
            console.error(`[youtube-sidebar] ${viewport.name} ${placement}`);
            results.push(await runScenario(browser, viewport, placement));
        }
    }
} finally {
    await browser.close();
}

const summary = { outputDir, results };
writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

async function runScenario(browser, viewport, placement) {
    const { name: _name, defaultBrowserType: _defaultBrowserType, ...contextOptions } = viewport;
    const context = await browser.newContext({
        ...contextOptions,
        bypassCSP: true,
        locale: 'ja-JP',
    });
    const page = await context.newPage();
    const label = `${viewport.name}-${placement}`;
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
    });
    try {
        await installFixtureRoutes(page);
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: smokeSettings(placement),
        });
        await page.goto('https://www.youtube.com/watch?v=p044fixture', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await installUserscriptCssResource(page, cssPath);
        for (const companion of companionPaths) await addScriptTagWithCspFallback(page, companion);
        await addScriptTagWithCspFallback(page, scriptPath);
        await page.waitForSelector('.jpdb-subtitle-player', { timeout: 10000 });
        await waitForPanelButton(page);
        await page.screenshot({ path: join(outputDir, `${label}-before.png`), fullPage: false });

        const openTiming = await timePageAction(page, async () => {
            await page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => button.click());
            await waitForPanelOpen(page);
        });
        const afterOpen = await snapshot(page);
        assertLayout(afterOpen, viewport.name, placement, 'open');
        await page.screenshot({ path: join(outputDir, `${label}-open.png`), fullPage: false });

        const resizeTiming = await timePageAction(page, async () => {
            await resizeTranscriptPanelByKeyboard(page, afterOpen.placement);
        });
        const afterResize = await snapshot(page);
        assertLayout(afterResize, viewport.name, placement, 'resize');
        await page.screenshot({ path: join(outputDir, `${label}-resized.png`), fullPage: false });

        const switchTiming = viewport.name === 'ipad-pro-portrait' && placement === 'right'
            ? await runSwitchSequence(page)
            : null;

        return {
            label,
            requestedPlacement: placement,
            effectivePlacement: afterOpen.placement,
            openMs: openTiming.durationMs,
            resizeMs: resizeTiming.durationMs,
            switchTiming,
            beforeSetSizeCount: afterOpen.setSizeCalls.length,
            afterResizeSetSizeCount: afterResize.setSizeCalls.length,
            resizeEvents: afterResize.resizeEvents,
            snapshot: compactSnapshot(afterResize),
            errors: errors.slice(0, 5),
        };
    } finally {
        await context.close();
    }
}

async function runSwitchSequence(page) {
    const timings = [];
    for (const placement of ['left', 'bottom', 'right']) {
        const timing = await timePageAction(page, async () => {
            await page.locator(`.jpdb-subtitle-panel-placement [data-placement="${placement}"]`).evaluate(button => button.click());
            await page.waitForFunction(expected => {
                return document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement') === expected
                    || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement') === expected;
            }, placement, { timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(120);
        });
        const state = await snapshot(page);
        assertLayout(state, 'ipad-pro-portrait', placement, `switch-${placement}`);
        await page.screenshot({ path: join(outputDir, `ipad-pro-portrait-switch-${placement}.png`), fullPage: false });
        timings.push({ placement, durationMs: timing.durationMs, effectivePlacement: state.placement });
    }
    return timings;
}

async function installFixtureRoutes(page) {
    await page.route('**/*', route => route.fulfill({ status: 204, body: '' }));
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({ body: youtubeFixtureHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText(), contentType: 'text/xml' }));
    await page.route('https://jpdb.io/api/v1/parse', async route => {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockJpdbParseFromVocabulary(body, vocabulary)),
        });
    });
}

function smokeSettings(placement) {
    return {
        onboardingSeen: true,
        interfaceLanguage: 'en',
        apiKey: 'fixture-key',
        jitenApiKey: '',
        ankiEnabled: false,
        ankiSectionEnabled: false,
        localDictionariesEnabled: false,
        audioEnabled: false,
        jpdbDefinitionsEnabled: false,
        enableLogging: false,
        showFloatingButton: false,
        subtitlePlayerEnabled: true,
        subtitleAutoDetect: true,
        subtitleOverlayVisible: true,
        subtitleSecondaryVisible: false,
        subtitleTranscriptVisible: false,
        subtitleTranscriptAutoScroll: false,
        subtitleTranscriptPlacement: placement,
        subtitleControlsMode: 'always',
    };
}

async function waitForPanelButton(page) {
    await page.waitForFunction(() => {
        const button = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
        return button instanceof HTMLButtonElement && !button.disabled && getComputedStyle(button).display !== 'none';
    }, null, { timeout: 15000 });
}

async function waitForPanelOpen(page) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panel instanceof HTMLElement && !panel.hidden && panel.getBoundingClientRect().width > 260;
    }, null, { timeout: 8000 });
}

async function timePageAction(page, action) {
    const started = await page.evaluate(() => performance.now());
    await action();
    const ended = await page.evaluate(() => performance.now());
    return { durationMs: Math.round((ended - started) * 10) / 10 };
}

async function resizeTranscriptPanelByKeyboard(page, placement) {
    const handle = page.locator('[data-resize-transcript]').first();
    const before = await panelSize(page);
    await handle.focus();
    const key = placement === 'bottom' ? 'ArrowUp' : placement === 'left' ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press(key);
    await page.keyboard.press(key);
    await page.waitForFunction(({ width, height }) => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!(panel instanceof HTMLElement)) return false;
        const rect = panel.getBoundingClientRect();
        return Math.abs(rect.width - width) > 20 || Math.abs(rect.height - height) > 20;
    }, before, { timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(120);
}

async function panelSize(page) {
    return page.evaluate(() => {
        const rect = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
    });
}

async function snapshot(page) {
    return page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
        const style = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            return {
                width: element.style.width,
                height: element.style.height,
                maxHeight: element.style.maxHeight,
                marginLeft: element.style.marginLeft,
                marginRight: element.style.marginRight,
            };
        };
        return {
            placement: document.querySelector('.jpdb-subtitle-player')?.getAttribute('data-transcript-placement')
                || document.querySelector('.jpdb-subtitle-list')?.getAttribute('data-transcript-placement')
                || '',
            viewport: { width: innerWidth, height: innerHeight },
            panel: rect('.jpdb-subtitle-list'),
            video: rect('#movie_player'),
            primary: rect('#primary'),
            columns: rect('#columns'),
            title: rect('ytd-watch-metadata h1'),
            actions: rect('#actions'),
            secondary: rect('#secondary'),
            panelStyle: style('.jpdb-subtitle-list'),
            primaryStyle: style('#primary'),
            primaryInnerStyle: style('#primary-inner'),
            playerStyle: style('#player'),
            moviePlayerStyle: style('#movie_player'),
            columnsStyle: style('#columns'),
            insetClasses: document.documentElement.className,
            insetValue: document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset'),
            setSizeCalls: globalThis.__yomuSetSizeCalls ?? [],
            resizeEvents: globalThis.__yomuResizeEvents ?? 0,
        };
    });
}

function assertLayout(state, viewportName, requestedPlacement, phase) {
    assertBox(state.panel, `${viewportName}/${requestedPlacement}/${phase} panel`);
    assertBox(state.video, `${viewportName}/${requestedPlacement}/${phase} video`);
    assert(!overlaps(state.panel, state.video), `panel overlaps video in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
    const expectedBottom = requestedPlacement === 'bottom' || state.viewport.width < 700;
    if (expectedBottom) {
        assert(state.placement === 'bottom', `expected bottom placement in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert(Math.abs(state.panel.bottom - state.viewport.height) <= 1, `bottom panel has a viewport gap in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert(state.primaryStyle?.height === '', `bottom mode resized YouTube primary column in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert(state.primaryInnerStyle?.height === '', `bottom mode resized YouTube primary-inner column in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert((state.title?.width ?? 0) <= state.viewport.width + 1, `title became abnormally wide in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        assert((state.actions?.width ?? 0) <= state.viewport.width + 1, `actions became abnormally wide in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
        return;
    }
    assert(state.placement === requestedPlacement, `unexpected side placement in ${viewportName}/${requestedPlacement}/${phase}`, compactSnapshot(state));
    if (requestedPlacement === 'left') {
        assert(state.panel.right <= state.video.left + 1, `left panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.panel.right <= state.title.left + 1, `left panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.columnsStyle?.marginLeft && state.columnsStyle.marginLeft !== '0px', `left docking did not shift YouTube columns in ${viewportName}/${phase}`, compactSnapshot(state));
    } else {
        assert(state.video.right <= state.panel.left + 1, `right panel covers video in ${viewportName}/${phase}`, compactSnapshot(state));
        assert(state.title.right <= state.panel.left + 1, `right panel covers title area in ${viewportName}/${phase}`, compactSnapshot(state));
    }
}

function compactSnapshot(state) {
    return {
        placement: state.placement,
        viewport: state.viewport,
        panel: roundRect(state.panel),
        video: roundRect(state.video),
        title: roundRect(state.title),
        actions: roundRect(state.actions),
        columnsStyle: state.columnsStyle,
        primaryStyle: state.primaryStyle,
        primaryInnerStyle: state.primaryInnerStyle,
        playerStyle: state.playerStyle,
        moviePlayerStyle: state.moviePlayerStyle,
        insetClasses: state.insetClasses,
        insetValue: state.insetValue,
    };
}

function assertBox(box, label) {
    assert(Boolean(box && box.width > 80 && box.height > 60), `missing usable ${label}`, { box });
}

function overlaps(a, b) {
    return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

function roundRect(rect) {
    if (!rect) return null;
    return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, Math.round(rect[key])]));
}

function youtubeTimedText() {
    return `<timedtext><body>
<p t="1000" d="2400"><s t="0">今日は</s><s t="600">日本語</s><s t="1200">字幕</s><s t="1700">を</s><s t="1900">確認</s><s t="2200">します</s></p>
<p t="4100" d="2600"><s t="0">左側</s><s t="500">でも</s><s t="900">動画</s><s t="1300">を</s><s t="1600">隠しません</s></p>
<p t="7200" d="3000"><s t="0">下側</s><s t="500">では</s><s t="900">説明</s><s t="1300">と</s><s t="1600">操作</s><s t="2100">を</s><s t="2400">広げません</s></p>
</body></timedtext>`;
}

const vocabulary = [
    ['今日', '今日', 'きょう', 'today', ['n'], 100, ['known'], ['LH']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['n'], 250, ['known'], ['LHHH']],
    ['字幕', '字幕', 'じまく', 'subtitles', ['n'], 1500, ['known'], ['LHH']],
    ['確認', '確認', 'かくにん', 'confirmation', ['n', 'vs'], 900, ['known'], ['LHHH']],
    ['左側', '左側', 'ひだりがわ', 'left side', ['n'], 1900, ['known'], ['LHHH']],
    ['動画', '動画', 'どうが', 'video', ['n'], 600, ['known'], ['LHH']],
    ['下側', '下側', 'したがわ', 'bottom side', ['n'], 2100, ['known'], ['LHHH']],
    ['説明', '説明', 'せつめい', 'description', ['n', 'vs'], 700, ['known'], ['LHHH']],
    ['操作', '操作', 'そうさ', 'operation', ['n', 'vs'], 1000, ['known'], ['LHH']],
];

function youtubeFixtureHtml() {
    const playerResponse = {
        videoDetails: { videoId: 'p044fixture' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=p044fixture&lang=ja',
                    languageCode: 'ja',
                    vssId: '.ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube P0-44 fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; overflow-x: hidden; }
    ytd-watch-flexy { display: block; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 24px; padding: 72px 24px 32px; box-sizing: border-box; align-items: start; }
    #primary, #primary-inner { min-width: 0; box-sizing: border-box; }
    #player, #player-container-outer, #player-container-inner, ytd-player { display: block; min-width: 0; }
    #movie_player { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 320px; background: #000; overflow: hidden; }
    #movie_player video { display: block; width: 100%; height: 100%; background: linear-gradient(135deg, #111, #252525); }
    .ytp-caption-window-container { position: absolute; left: 20%; right: 20%; bottom: 64px; text-align: center; font-size: 28px; text-shadow: 0 2px 4px #000; }
    ytd-watch-metadata { display: block; min-width: 0; padding-top: 18px; }
    ytd-watch-metadata h1 { margin: 0 0 14px; font-size: 24px; line-height: 1.28; font-weight: 650; overflow-wrap: anywhere; }
    #actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-width: 0; }
    #actions button { border: 0; border-radius: 18px; padding: 8px 14px; color: #f1f1f1; background: #272727; font: inherit; }
    #description { max-width: 100%; box-sizing: border-box; border-radius: 8px; padding: 12px 14px; background: #272727; color: #ddd; line-height: 1.5; overflow-wrap: anywhere; }
    #secondary { display: grid; gap: 14px; min-width: 0; color: #ddd; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px; min-width: 0; }
    .thumb { min-height: 78px; border-radius: 8px; background: #303030; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; }
    @media (max-width: 699px) {
      #columns { display: block; padding: 56px 12px 24px; }
      #secondary { margin-top: 18px; }
      #movie_player { min-height: 210px; }
    }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    for (const name of ['ytd-watch-flexy', 'ytd-player', 'ytd-watch-metadata', 'ytd-compact-video-renderer']) {
      if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
    }
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="p044fixture">
    <main id="columns">
      <section id="primary">
        <div id="primary-inner">
          <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player>
            <div id="movie_player">
              <video controls muted playsinline></video>
              <div class="ytp-caption-window-container"><span class="ytp-caption-segment">今日は日本語字幕を確認します</span></div>
            </div>
          </ytd-player></div></div></div>
          <ytd-watch-metadata>
            <h1>日本語タイトルと説明を確認するための動画</h1>
            <div id="actions">
              <button type="button">Like</button><button type="button">Share</button><button type="button">Save</button><button type="button">Clip</button>
            </div>
            <div id="description">これは説明欄です。下側の文字起こしパネルでも横幅が異常に広がらず、ボタンやタイトルと同じ列に収まります。</div>
          </ytd-watch-metadata>
        </div>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 8 }, (_, index) => `<ytd-compact-video-renderer><div class="thumb"></div><a href="/watch?v=${index}">おすすめ動画 ${index + 1} と日本語の説明</a></ytd-compact-video-renderer>`).join('')}
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    globalThis.__yomuSetSizeCalls = [];
    globalThis.__yomuResizeEvents = 0;
    window.addEventListener('resize', () => { globalThis.__yomuResizeEvents += 1; });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 1.4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    player.getVideoData = () => ({ video_id: 'p044fixture' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      globalThis.__yomuSetSizeCalls.push({ width, height, at: performance.now() });
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
  </script>
</body>
</html>`;
}
