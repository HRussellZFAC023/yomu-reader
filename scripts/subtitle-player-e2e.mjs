import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { assert } from './lib/smoke-harness.mjs';
import { createYomuPaths } from './lib/paths.mjs';
import { dragTranscriptResizeHandle, panelSizeDelta } from './lib/subtitle-layout-test-utils.mjs';

const { qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const userscriptPath = resolve(process.env.YOMU_E2E_USERSCRIPT ?? 'dist/yomu.user.js');
const readerCssPath = resolve(process.env.YOMU_E2E_READER_CSS ?? 'dist/yomu.css');
const artifactsDir = resolve(process.env.YOMU_E2E_ARTIFACTS ?? join(qaArtifactsRoot, 'subtitle-e2e/latest'));
const youtubeUrl = process.env.YOMU_E2E_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=5050s';
const fixtureVideoUrl = process.env.YOMU_E2E_VIDEO_URL ?? '';
const useYouTubeFixture = process.env.YOMU_E2E_YOUTUBE_FIXTURE === '1';
const headed = process.env.YOMU_E2E_HEADED === '1';
const settingsStorageKey = 'jpdb-popup-reader-settings';
const transcriptPlacements = ['right', 'left', 'bottom'];

const primaryVtt = `WEBVTT

00:00:00.000 --> 00:00:04.000
この小人は立っています。

00:00:04.000 --> 00:00:08.000
それからカメラを持っています。

00:00:08.000 --> 00:00:12.000
でも多分、ガイドブックか地図ですかね。

00:00:12.000 --> 00:00:18.000
これはとても長い日本語字幕の行で、狭い横幅の文字起こしパネルでもはみ出さずに折り返される必要があります。
`;

const nativeSrt = `1
00:00:00,000 --> 00:00:04,000
This little person is standing.

2
00:00:04,000 --> 00:00:08,000
Then they are holding a camera.
`;

const youtubeTimedText = `<timedtext><body>
<p t="5040000" d="2000"><s t="0">これは一つ目です。</s></p>
<p t="5044000" d="2200"><s t="0">次の行も表示します。</s></p>
<p t="5049000" d="2400"><s t="0">前後の行を保ちます。</s></p>
<p t="5054000" d="2600"><s t="0">これは狭いサイドバーでも折り返して読める長い字幕行です。</s></p>
</body></timedtext>`;

const FIXTURE_ROUTES = new Map([
    ['/generic', origin => ({ body: genericHtml(origin), contentType: 'text/html' })],
    ['/primary.vtt', () => ({ body: primaryVtt, contentType: 'text/vtt' })],
    ['/native.srt', () => ({ body: nativeSrt, contentType: 'text/plain' })],
]);

function rectsOverlap(a, b, tolerance = 4) {
    return !(a.right <= b.left + tolerance
        || a.left >= b.right - tolerance
        || a.bottom <= b.top + tolerance
        || a.top >= b.bottom - tolerance);
}

function rectFromJson(rect) {
    return rect && {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

function genericHtml(origin) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Yomu generic video fixture</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #101820; color: #e8edf4; font-family: system-ui, sans-serif; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; padding: 28px; box-sizing: border-box; }
    .player { position: relative; background: #050608; border: 1px solid #243447; }
    video { display: block; width: 100%; aspect-ratio: 16 / 9; background: #050608; }
    .caption-window { position: absolute; left: 18%; right: 18%; bottom: 78px; text-align: center; font-size: 28px; color: white; text-shadow: 0 2px 4px black; }
    aside { border-left: 1px solid #2c3b4e; padding-left: 18px; color: #9fb0c3; }
    @media (max-width: 700px) {
      main { display: block; padding: 0; }
      .player { border: 0; }
      aside { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <section class="player">
      <video controls muted preload="metadata" ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}>
        <track kind="subtitles" srclang="ja-JP" label="日本語" src="${origin}/primary.vtt" default>
      </video>
      <div class="caption-window">この小人は立っています。</div>
    </section>
    <aside>
      <h2>Ordinary Video Page</h2>
      <a href="${origin}/native.srt" download="native.srt">SRT</a>
    </aside>
  </main>
</body>
</html>`;
}

function cijHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>小人は何をしてる？ What Are the Dwarfs Doing?</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #111e2b; color: #eef4fb; font-family: Poppins, system-ui, sans-serif; }
    header { height: 138px; display: flex; align-items: center; gap: 18px; padding: 0 30px; background: #142637; box-sizing: border-box; }
    .logo { width: 96px; height: 96px; border-radius: 50%; background: #dc7aa5; display: grid; place-items: center; font-weight: 700; }
    .layout { display: grid; grid-template-columns: minmax(560px, 1fr) 420px; gap: 22px; padding: 38px 16px; box-sizing: border-box; }
    .video-card { position: relative; background: #16283a; border: 1px solid #243e56; }
    video { width: 100%; aspect-ratio: 16 / 9; display: block; background: #050607; }
    .caption-window { position: absolute; left: 20%; right: 20%; bottom: 92px; padding: 8px 14px; border-radius: 6px; background: rgba(0,0,0,.72); text-align: center; font-size: 26px; color: white; }
    .tabs { height: 280px; padding: 24px; border-top: 1px solid #284057; color: #c7d5e4; }
    aside { min-height: 760px; background: #142333; border: 1px solid #243e56; padding: 22px; color: #aab7c7; }
    a { color: #9fd0ff; }
  </style>
</head>
<body>
  <header><div class="logo">日本語</div><div><h1>Comprehensible Japanese</h1><p>LEARN JAPANESE THROUGH MEANINGFUL INPUT</p></div></header>
  <main class="layout">
    <section class="video-card">
      <video controls muted preload="metadata" ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}>
        <track kind="subtitles" srclang="ja-JP" label="日本語" src="https://cijapanese.com/media/subtitles.vtt?filename=%E5%B0%8F%E4%BA%BA.vtt&v=123" default>
      </video>
      <div class="caption-window">この小人は立っています。</div>
      <div class="tabs">
        <h2>Yoshito先生</h2>
        <p>Teacher info and downloads are below the player.</p>
        <a href="https://cijapanese.com/media/native.srt" download="native.srt">SRT</a>
      </div>
    </section>
    <aside><h2>Similar Videos</h2><p>Right-column content should remain usable while the Yomu panel chooses available space.</p></aside>
  </main>
</body>
</html>`;
}

function youtubeFixtureHtml() {
    const response = {
        videoDetails: { videoId: 'TAorfFcb8_g' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=TAorfFcb8_g&lang=ja',
                    languageCode: 'ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: white; font-family: Roboto, Arial, sans-serif; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 22px; padding: 56px 24px 24px; box-sizing: border-box; }
    #movie_player { position: relative; background: #000; aspect-ratio: 16 / 9; min-height: 420px; }
    #movie_player video { width: 100%; height: 100%; display: block; background: #050505; }
    .caption-window { position: absolute; left: 20%; right: 20%; bottom: 76px; font-size: 32px; text-align: center; text-shadow: 0 2px 4px black; }
    aside { color: #aaa; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(response)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy>
    <div id="columns">
      <div id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}></video>
            <div class="caption-window"><span class="ytp-caption-segment">ルーターと同じ</span></div>
          </div>
        </div></div></div>
      </div>
      <aside id="secondary"><div id="secondary-inner"><h2>Recommended</h2><p>Sidebar content</p></div></aside>
    </div>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    player.getVideoData = () => ({ video_id: 'TAorfFcb8_g' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.setOption = () => {};
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { player.style.width = width + 'px'; player.style.height = height + 'px'; };
  </script>
</body>
</html>`;
}

function mobileYouTubeFixtureHtml() {
    const response = {
        videoDetails: { videoId: '_fXQ8TquRWo' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://m.youtube.com/api/timedtext?v=_fXQ8TquRWo&lang=ja',
                    languageCode: 'ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mobile YouTube fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: white; font-family: Roboto, Arial, sans-serif; }
    .mobile-watch { width: 390px; min-height: 900px; padding-top: 48px; background: #0f0f0f; }
    #movie_player { position: relative; width: 390px; height: 219px; background: #000; }
    #movie_player video { width: 100%; height: 100%; display: block; background: #050505; }
    .caption-window { position: absolute; left: 12%; right: 12%; bottom: 42px; font-size: 22px; text-align: center; text-shadow: 0 2px 4px black; }
    .metadata { padding: 16px 20px; font-size: 16px; line-height: 1.45; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(response)};
  </script>
</head>
<body>
  <main class="mobile-watch">
    <div id="player"><div id="player-container-outer"><div id="player-container-inner">
      <div id="movie_player">
        <video controls muted ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}></video>
        <div class="caption-window"><span class="ytp-caption-segment">今から体を描きます。</span></div>
      </div>
    </div></div></div>
    <section class="metadata">
      <h1>Body Parts | Complete Beginner Japanese Comprehensible Input</h1>
      <p>にほんごのじかん</p>
    </section>
  </main>
  <script>
    const player = document.querySelector('#movie_player');
    player.getVideoData = () => ({ video_id: '_fXQ8TquRWo' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.setOption = () => {};
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { player.style.width = width + 'px'; player.style.height = height + 'px'; };
  </script>
</body>
</html>`;
}

async function startFixtureServer() {
    const server = http.createServer(serveFixtureRequest);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return { server, origin: `http://127.0.0.1:${address.port}` };
}

function serveFixtureRequest(req, res) {
    const origin = `http://${req.headers.host}`;
    const url = new URL(req.url ?? '/', origin);
    const route = FIXTURE_ROUTES.get(url.pathname);
    if (!route) {
        send(res, 'not found', 'text/plain', 404);
        return;
    }
    const response = route(origin);
    send(res, response.body, response.contentType);
}

function send(res, body, contentType, status = 200) {
    res.writeHead(status, { 'content-type': `${contentType}; charset=utf-8`, 'access-control-allow-origin': '*' });
    res.end(body);
}

async function ensureUserscript(page) {
    if (await page.locator('.jpdb-subtitle-player').count()) return;
    await installUserscriptStyleResource(page);
    try {
        await page.addScriptTag({ path: userscriptPath });
    } catch {
        const client = await page.context().newCDPSession(page);
        await client.send('Runtime.evaluate', {
            expression: readFileSync(userscriptPath, 'utf8'),
            awaitPromise: false,
            allowUnsafeEvalBlockedByCSP: true,
            replMode: true,
        });
    }
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 10000 });
}

async function installUserscriptStyleResource(page) {
    const readerCss = readFileSync(readerCssPath, 'utf8');
    const polyfill = `
            window.GM_getResourceText = name => name === 'yomuCss' ? ${JSON.stringify(readerCss)} : '';
            window.GM_addStyle = css => {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.append(style);
                return style;
            };
        `;
    try {
        await page.addScriptTag({ content: polyfill });
    } catch {
        const client = await page.context().newCDPSession(page);
        await client.send('Runtime.evaluate', {
            expression: polyfill,
            awaitPromise: false,
            allowUnsafeEvalBlockedByCSP: true,
            replMode: true,
        });
    }
}

async function installFixtureRoutes(page) {
    await page.route('https://cijapanese.com/video/560**', route => route.fulfill({ body: cijHtml(), contentType: 'text/html' }));
    await page.route('https://cijapanese.com/media/subtitles.vtt**', route => route.fulfill({ body: primaryVtt, contentType: 'text/vtt' }));
    await page.route('https://cijapanese.com/media/native.srt**', route => route.fulfill({ body: nativeSrt, contentType: 'text/plain' }));
}

async function installYouTubeFixtureRoutes(page) {
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({ body: youtubeFixtureHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText, contentType: 'text/xml' }));
}

async function installMobileYouTubeFixtureRoutes(page) {
    await page.route('https://m.youtube.com/watch**', route => route.fulfill({ body: mobileYouTubeFixtureHtml(), contentType: 'text/html' }));
    await page.route('https://m.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText, contentType: 'text/xml' }));
}

async function openAndReady(page, site) {
    const diagnostics = collectPageDiagnostics(page);
    await prepareSiteBeforeNavigation(page, site);
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await prepareSiteAfterNavigation(page, site);
    await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.getBoundingClientRect().width > 240;
    }, null, { timeout: 20000 });
    await waitForSubtitleSurface(page, site);
    await assertDrawerModeControls(page);
    return diagnostics;
}

function collectPageDiagnostics(page) {
    const yomuLogs = [];
    const errors = [];
    page.on('console', message => {
        const text = message.text();
        if (text.includes('[Yomu]')) yomuLogs.push(text);
        if (message.type() === 'error') errors.push(text);
    });
    page.on('pageerror', error => errors.push(error.message));
    return { yomuLogs, errors };
}

async function prepareSiteBeforeNavigation(page, site) {
    if (site.route) await site.route(page);
    if (site.youtubeConsent) await installYouTubeConsentCookies(page);
}

async function prepareSiteAfterNavigation(page, site) {
    await dismissBlockingOverlays(page);
    await clearPageStorage(page);
    if (site.settings) await seedSettings(page, site.settings);
    await ensureUserscript(page);
    await dismissBlockingOverlays(page);
    if (site.prepare) await site.prepare(page);
}

async function clearPageStorage(page) {
    await page.evaluate(() => {
        try { localStorage.clear(); } catch {}
    });
}

async function seedSettings(page, settings) {
    await page.evaluate(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: settingsStorageKey, value: settings });
}

async function installYouTubeConsentCookies(page) {
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    await page.context().addCookies([
        { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+410', domain: '.youtube.com', path: '/', expires, sameSite: 'Lax', secure: true },
        { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+410', domain: '.google.com', path: '/', expires, sameSite: 'Lax', secure: true },
        { name: 'PREF', value: 'hl=en-GB&tz=Europe.London', domain: '.youtube.com', path: '/', expires, sameSite: 'Lax', secure: true },
    ]);
}

async function waitForSubtitleSurface(page, site) {
    await page.waitForFunction(subtitleSurfaceReady, null, { timeout: site.readyTimeout ?? 25000 });
    if (site.expectClosedRailTappable) await assertClosedRailPanelButton(page, site);

    await openTracksPanel(page);
    await maybeSelectFirstJapaneseTrack(page);
    await page.waitForFunction(subtitleLinesReady, null, { timeout: site.readyTimeout ?? 25000 });
    await openLinesOrTracksPanel(page);
}

async function assertClosedRailPanelButton(page, site) {
    await page.waitForFunction(closedRailPanelButtonVisible, null, { timeout: site.readyTimeout ?? 25000 });
    await clickRailPanelButton(page);
    await waitForPanelOpen(page);
    await closePanelFromRail(page);
}

function closedRailPanelButtonVisible() {
    const button = document.querySelector('.jpdb-subtitle-rail [data-action="panel"]');
    if (!railPanelButtonUsable(button)) return false;
    return railElementVisible(button.closest('.jpdb-subtitle-rail'));

    function railPanelButtonUsable(candidate) {
        return Boolean(candidate && !candidate.disabled && !candidate.hidden);
    }

    function railElementVisible(rail) {
        if (!rail) return false;
        const style = getComputedStyle(rail);
        if (Number(style.opacity) <= 0) return false;
        return Object.entries({
            display: 'none',
            visibility: 'hidden',
            pointerEvents: 'none',
        }).every(([property, hiddenValue]) => style[property] !== hiddenValue);
    }
}

function subtitleSurfaceReady() {
    return hasSubtitleRows()
        || hasSubtitleTracks()
        || subtitleStatusMentionsTracks();

    function hasSubtitleRows() {
        return document.querySelectorAll('.jpdb-subtitle-list-row').length > 0;
    }

    function hasSubtitleTracks() {
        return document.querySelectorAll('.jpdb-subtitle-track-row').length > 0;
    }

    function subtitleStatusMentionsTracks() {
        const status = document.querySelector('.jpdb-subtitle-status')?.textContent ?? '';
        return /subtitle|track|字幕|トラック/i.test(status);
    }
}

function subtitleLinesReady() {
    return document.querySelectorAll('.jpdb-subtitle-list-row').length > 0
        || Boolean(document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim())
        || Boolean(document.querySelector('.jpdb-subtitle-track-row.active'));
}

async function maybeSelectFirstJapaneseTrack(page) {
    const rows = await page.locator('.jpdb-subtitle-list-row').count();
    if (rows) return;
    const firstJapanese = page.locator('.jpdb-subtitle-track-row').filter({ hasText: /Japanese|日本語|JA/i }).first();
    if (!await firstJapanese.count()) return;
    await pressPrimaryTrackIfNeeded(firstJapanese);
}

async function pressPrimaryTrackIfNeeded(track) {
    const button = track.locator('[data-action="primary-track"]').first();
    if (await button.getAttribute('aria-pressed') === 'true') return;
    await button.click();
}

async function dismissBlockingOverlays(page) {
    for (const label of [/Reject all/i, /Accept all/i, /I agree/i, /Got it/i]) {
        const button = page.getByRole('button', { name: label }).first();
        if (!await button.count()) continue;
        try {
            await button.click({ timeout: 2500 });
            await page.waitForTimeout(1500);
            return;
        } catch {
            // Try the next known consent button.
        }
    }
}

async function assertDrawerModeControls(page) {
    await openTracksPanel(page);
    await waitForDrawerMode(page, 'tracks');

    const linesButton = page.locator('.jpdb-subtitle-list [data-action="panel-lines"]').first();
    const canOpenLines = await linesButton.evaluate(button => !button.disabled).catch(() => false);
    if (canOpenLines) {
        await linesButton.click();
        await waitForDrawerMode(page, 'lines');
    }

    await page.locator('.jpdb-subtitle-list [data-action="panel-tracks"]').first().click();
    await waitForDrawerMode(page, 'tracks');
    await assertDrawerHeaderControls(page);
    await closePanelFromRail(page);
    await openTracksPanel(page);
}

async function assertDrawerHeaderControls(page) {
    const closeButtons = await page.locator('.jpdb-subtitle-list [data-action="close-panel"]').count();
    assert(closeButtons === 0, 'drawer header should not render its own close button', { closeButtons });
    const placementButtons = await page.locator('.jpdb-subtitle-list [data-action="transcript-placement"][data-placement]').count();
    assert(placementButtons === 3, 'drawer header should expose left, below, and right dock controls', { placementButtons });
}

async function waitForDrawerMode(page, mode) {
    await page.waitForFunction(expectedMode => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return panelMode(panel) === expectedMode;

        function panelMode(panel) {
            if (!panel || panel.hidden) return '';
            const modes = ['lines', 'tracks'];
            return modes.find(mode => panel.classList.contains(`jpdb-subtitle-${mode}-panel`)
                && panel.querySelector(`[data-action="panel-${mode}"][aria-pressed="true"]`)) || 'open';
        }
    }, mode, { timeout: 5000 });
}

async function openTracksPanel(page) {
    const openPanelMode = await readOpenPanelMode(page);
    if (openPanelMode === 'tracks') return;
    if (!openPanelMode) {
        await clickRailPanelButton(page);
        await waitForPanelOpen(page);
    }
    await page.locator('.jpdb-subtitle-list [data-action="panel-tracks"]').first().click();
    await waitForDrawerMode(page, 'tracks');
}

async function readOpenPanelMode(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel || panel.hidden) return '';
        return ['tracks', 'lines'].find(mode => panel.querySelector(`[data-action="panel-${mode}"][aria-pressed="true"]`)) || 'open';
    });
}

async function clickRailPanelButton(page, options = {}) {
    const panelButton = page.locator('.jpdb-subtitle-rail [data-action="panel"]').first();
    await panelButton.waitFor({ state: 'visible', timeout: 5000 });
    await panelButton.click(options);
}

async function waitForPanelOpen(page) {
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
}

async function closePanelFromRail(page) {
    await page.waitForTimeout(250);
    await clickRailPanelButton(page, { force: true });
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
}

async function openLinesOrTracksPanel(page) {
    const openPanelMode = await readOpenPanelMode(page);
    if (openPanelMode === 'lines') return;
    if (openPanelMode) {
        await switchOpenPanelToLines(page);
        return;
    }

    await openPanelFromRailOrTracks(page);
}

async function switchOpenPanelToLines(page) {
    const linesButton = page.locator('.jpdb-subtitle-list [data-action="panel-lines"]').first();
    const canOpenLines = await linesButton.evaluate(button => !button.disabled).catch(() => false);
    if (!canOpenLines) return;
    await linesButton.click();
    await waitForDrawerMode(page, 'lines');
}

async function openPanelFromRailOrTracks(page) {
    if (!await canOpenRailPanel(page)) {
        await openTracksPanel(page);
        return;
    }
    if (await panelAlreadyOpenOnLines(page)) return;
    await clickRailPanelButton(page);
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
}

async function canOpenRailPanel(page) {
    return page.locator('.jpdb-subtitle-rail [data-action="panel"]').evaluate(button => {
        const element = button;
        return !element.hidden && !(element instanceof HTMLButtonElement && element.disabled) && getComputedStyle(element).display !== 'none';
    }).catch(() => false);
}

async function panelAlreadyOpenOnLines(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const lines = panel?.querySelector('[data-action="panel-lines"][aria-pressed="true"]');
        return Boolean(panel && !panel.hidden && lines);
    });
}

async function resizePanel(page, placement) {
    const handleLocator = page.locator('[data-resize-transcript]');
    if (placement === 'left') {
        await handleLocator.focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(350);
        return true;
    }
    return dragTranscriptResizeHandle(page, placement);
}

async function snapshot(page, site) {
    return page.evaluate(anchorSelector => {
        return subtitleSnapshot();

        function subtitleSnapshot() {
            const layout = subtitleLayoutSnapshot();
            return {
                ...layout,
                rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
                tracks: document.querySelectorAll('.jpdb-subtitle-track-row').length,
                yomuCaptionsActive: document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active'),
                nativeCaptionVisible: nativeCaptionVisible(),
                blockingDialogVisible: Boolean(findVisibleBlockingDialog()),
                overflowingRows: overflowingTranscriptRows(),
                viewport: { width: window.innerWidth, height: window.innerHeight },
            };
        }

        function subtitleLayoutSnapshot() {
            const moviePlayer = document.querySelector('#movie_player');
            const video = moviePlayer || document.querySelector('video');
            return {
                placement: document.querySelector('.jpdb-subtitle-player')?.dataset.transcriptPlacement ?? '',
                panel: rectJson(document.querySelector('.jpdb-subtitle-list')),
                video: rectJson(video),
                anchor: rectJson(anchorElement()),
            };
        }

        function rectJson(element) {
            return element?.getBoundingClientRect().toJSON();
        }

        function anchorElement() {
            if (anchorSelector) return document.querySelector(anchorSelector);
            return document.querySelector('#movie_player, .video-card, .player, [data-yomu-video-frame]') || document.querySelector('video');
        }

        function nativeCaptionVisible() {
            const nativeCaption = document.querySelector('.caption-window');
            if (!nativeCaption) return true;
            const style = getComputedStyle(nativeCaption);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function findVisibleBlockingDialog() {
            const dialogs = [...document.querySelectorAll('[role="dialog"], tp-yt-paper-dialog')];
            return dialogs.find(isVisibleBlockingDialog) || null;
        }

        function isVisibleBlockingDialog(element) {
            return hasBlockingDialogText(element) && isVisibleInViewport(element);
        }

        function hasBlockingDialogText(element) {
            return /Before you continue|cookies and data|Sign in to confirm/i.test(element.textContent ?? '');
        }

        function isVisibleInViewport(element) {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return [
                style.display !== 'none',
                style.visibility !== 'hidden',
                style.opacity !== '0',
                rect.width >= 120,
                rect.height >= 80,
                rect.right > 0,
                rect.bottom > 0,
                rect.left < window.innerWidth,
                rect.top < window.innerHeight,
            ].every(Boolean);
        }
        function overflowingTranscriptRows() {
            return [...document.querySelectorAll('.jpdb-subtitle-list-row')]
                .map(transcriptRowOverflow)
                .filter(Boolean);
        }

        function transcriptRowOverflow(row, index) {
            const text = row.querySelector('.jpdb-subtitle-row-text');
            if (!text) return null;
            const rowRect = row.getBoundingClientRect();
            const textRect = text.getBoundingClientRect();
            if (!isTranscriptTextClipped(text, rowRect, textRect)) return null;
            return {
                index,
                text: text.textContent?.trim().slice(0, 120) ?? '',
                row: rowRect.toJSON(),
                textRect: textRect.toJSON(),
                scrollWidth: text.scrollWidth,
                clientWidth: text.clientWidth,
            };
        }

        function isTranscriptTextClipped(text, rowRect, textRect) {
            return text.scrollWidth > text.clientWidth + 2
                || textRect.left < rowRect.left - 1
                || textRect.right > rowRect.right + 1;
        }
    }, site.anchorSelector ?? '');
}

async function exerciseDrawerLayout(page, site) {
    const results = [];
    for (const phase of ['initial', 'resized']) {
        results.push(await exerciseDrawerLayoutPhase(page, site, phase));
    }
    return results;
}

async function exerciseDrawerLayoutPhase(page, site, phase) {
    const resize = await prepareDrawerLayoutPhase(page, site, phase);
    const state = await snapshot(page, site);
    const layout = drawerLayoutRects(state, phase);
    assertDrawerLayoutState(site, phase, state, layout);
    assertDrawerResize(site, phase, resize, layout, state);
    assertExpectedSubtitleState(site, phase, state);
    const screenshot = await writeDrawerScreenshot(page, site, phase);
    return drawerLayoutResult(phase, layout.placement, resize.resized, screenshot, state);
}

async function prepareDrawerLayoutPhase(page, site, phase) {
    await openLinesOrTracksPanel(page);
    await waitForDrawerLayoutSettled(page, site);
    if (phase !== 'resized') return { beforeResizePanel: undefined, resized: false };
    const beforeResize = await snapshot(page, site);
    const beforeResizePanel = rectFromJson(beforeResize.panel);
    const beforeResizeVideo = rectFromJson(beforeResize.video);
    const resized = await resizePanel(page, beforeResize.placement || 'right');
    return { beforeResizePanel, beforeResizeVideo, resized };
}

async function waitForDrawerLayoutSettled(page, site) {
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const video = videoRect();
        if (!panel || !video) return false;
        if (!hasSubtitlePanelContent()) return false;
        return boxesSeparated(panel, video);

        function videoRect() {
            const moviePlayer = document.querySelector('#movie_player');
            return (moviePlayer || document.querySelector('video'))?.getBoundingClientRect();
        }

        function hasSubtitlePanelContent() {
            const rows = document.querySelectorAll('.jpdb-subtitle-list-row').length;
            const tracks = document.querySelectorAll('.jpdb-subtitle-track-row').length;
            return rows > 0 || tracks > 0;
        }

        function boxesSeparated(panel, video) {
            return [
                panel.right <= video.left + 1,
                video.right <= panel.left + 1,
                panel.bottom <= video.top + 1,
                video.bottom <= panel.top + 1,
            ].some(Boolean);
        }
    }, null, { timeout: site.readyTimeout ?? 25000 });
    await page.waitForTimeout(150);
}

function drawerLayoutRects(state, phase) {
    return {
        placement: state.placement || phase,
        panel: rectFromJson(state.panel),
        video: rectFromJson(state.video),
        anchor: rectFromJson(state.anchor),
    };
}

function assertDrawerLayoutState(site, phase, state, layout) {
    assert(hasTranscriptPanel(layout.panel), `${site.name}: missing transcript panel during ${phase}`, state);
    assert(hasUsableVideo(layout.video), `${site.name}: missing usable video during ${phase}`, state);
    if (site.expectPlacement) assert(isExpectedPlacementForPhase(site.expectPlacement, phase, layout.placement), `${site.name}: unexpected transcript placement during ${phase}`, state);
    if (site.expectEdgeToEdgePanel) assert(isEdgeToEdgePanel(layout.panel, state.viewport), `${site.name}: compact transcript panel is not edge-to-edge during ${phase}`, state);
    assert(!rectsOverlap(layout.panel, layout.video), `${site.name}: transcript panel overlaps video during ${phase}`, state);
    assert(panelFitsViewport(layout.panel, state.viewport), `${site.name}: transcript panel leaves viewport during ${phase}`, state);
    assertTranscriptRowsWrap(site, phase, state);
    assertPlacementGeometry(site, phase, layout, state);
    if (!site.ignoreBlockingDialogs) {
        assert(!state.blockingDialogVisible, `${site.name}: blocking page dialog is covering the verification screenshot`, state);
    }
}

function hasTranscriptPanel(panel) {
    return isUsableLayoutBox(panel, 260, 80);
}

function hasUsableVideo(video) {
    return isUsableLayoutBox(video, 240, 120);
}

function isUsableLayoutBox(box, minWidth, minHeight) {
    return Boolean(box && box.width >= minWidth && box.height >= minHeight);
}

function panelFitsViewport(panel, viewport) {
    return panel.left >= -1
        && panel.top >= -1
        && panel.right <= viewport.width + 1
        && panel.bottom <= viewport.height + 1;
}

function isEdgeToEdgePanel(panel, viewport) {
    return Math.abs(panel.left) <= 1 && Math.abs(panel.width - viewport.width) <= 1;
}

function isExpectedPlacementForPhase(expectedPlacement, phase, actualPlacement) {
    return actualPlacement === expectedPlacement;
}

function assertTranscriptRowsWrap(site, phase, state) {
    assert((state.overflowingRows ?? []).length === 0, `${site.name}: transcript row text overflowed horizontally during ${phase}`, {
        overflowingRows: state.overflowingRows,
        placement: state.placement,
        viewport: state.viewport,
    });
}

function assertPlacementGeometry(site, phase, layout, state) {
    if (layout.placement === 'bottom') {
        assert(layout.video.bottom <= layout.panel.top + 4, `${site.name}: bottom transcript panel did not leave the player above the sheet during ${phase}`, state);
        if (state.viewport.width >= 700) {
            assert(layout.video.height >= 240, `${site.name}: bottom transcript panel made the player too short on a wide viewport during ${phase}`, state);
        }
        return;
    }
    if (!layout.anchor) return;
    assert(Math.abs(layout.panel.top - layout.anchor.top) <= 6, `${site.name}: side transcript panel lost stable frame-top alignment during ${phase}`, {
        placement: layout.placement,
        panel: layout.panel,
        anchor: layout.anchor,
        video: layout.video,
    });
}

function assertDrawerResize(site, phase, resize, layout, state) {
    if (phase !== 'resized') return;
    assert(resize.resized, `${site.name}: transcript drawer resize handle was not available`, state);
    assert(panelSizeDelta(resize.beforeResizePanel, layout.panel) >= 24, `${site.name}: transcript drawer did not resize`, {
        beforeResizePanel: resize.beforeResizePanel,
        afterResizePanel: layout.panel,
        placement: layout.placement,
    });
    if (layout.placement !== 'bottom' && resize.beforeResizeVideo) {
        assert(Math.abs(resize.beforeResizeVideo.height - layout.video.height) <= 8, `${site.name}: side resize changed player height`, {
            beforeResizeVideo: resize.beforeResizeVideo,
            afterResizeVideo: layout.video,
            placement: layout.placement,
        });
    }
}

function assertExpectedSubtitleState(site, phase, state) {
    if (site.expectRows !== false) assert(state.rows > 0, `${site.name}: transcript lines did not render during ${phase}`, state);
    if (site.minRows) assert(state.rows >= site.minRows, `${site.name}: expected the full transcript window during ${phase}`, state);
    if (!site.expectNativeCaptions) return;
    assert(!state.yomuCaptionsActive, `${site.name}: generic page captions were hidden by YouTube-only caption suppression`, state);
    assert(state.nativeCaptionVisible, `${site.name}: page native captions are not visible`, state);
}

async function writeDrawerScreenshot(page, site, phase) {
    const screenshot = join(artifactsDir, `${site.name}-${phase}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    return screenshot;
}

function drawerLayoutResult(phase, effectivePlacement, resized, screenshot, state) {
    return { phase, effectivePlacement, resized, screenshot, rows: state.rows, tracks: state.tracks };
}

async function runSite(browser, site) {
    const page = await browser.newPage({ viewport: site.viewport, locale: 'en-GB' });
    try {
        console.error(`[subtitle-e2e] ${site.name}`);
        const telemetry = await openAndReady(page, site);
        if (site.exerciseDockingControls) await assertDrawerDockingControls(page, site);
        const layouts = await exerciseDrawerLayout(page, site);
        return {
            site: site.name,
            url: site.url,
            layouts,
            yomuLogCount: telemetry.yomuLogs.length,
            pageErrors: telemetry.errors.slice(0, 5),
        };
    } catch (error) {
        console.error(`[subtitle-e2e] ${site.name} failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    } finally {
        await page.close();
    }
}

async function assertDrawerDockingControls(page, site) {
    await openLinesOrTracksPanel(page);
    await waitForDrawerLayoutSettled(page, site);
    await assertDrawerHeaderControls(page);
    await chooseDrawerPlacement(page, 'bottom');
    await waitForDrawerLayoutSettled(page, site);
    let state = await snapshot(page, site);
    let layout = drawerLayoutRects(state, 'dock-bottom');
    assert(layout.placement === 'bottom', `${site.name}: dock control did not move drawer below`, state);
    assertDrawerLayoutState({ ...site, expectPlacement: 'bottom' }, 'dock-bottom', state, layout);

    await chooseDrawerPlacement(page, 'right');
    await waitForDrawerLayoutSettled(page, site);
    state = await snapshot(page, site);
    layout = drawerLayoutRects(state, 'dock-right');
    assert(layout.placement === 'right', `${site.name}: dock control did not restore right drawer`, state);
    assertDrawerLayoutState({ ...site, expectPlacement: 'right' }, 'dock-right', state, layout);
    const persistedPlacement = await page.evaluate(key => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value).subtitleTranscriptPlacement : '';
    }, settingsStorageKey);
    assert(persistedPlacement === 'right', `${site.name}: dock control did not persist placement setting`, { persistedPlacement });
}

async function chooseDrawerPlacement(page, placement) {
    await page.locator(`.jpdb-subtitle-list [data-action="transcript-placement"][data-placement="${placement}"]`).first().click();
    await page.waitForFunction(expected => {
        const player = document.querySelector('.jpdb-subtitle-player');
        const panel = document.querySelector('.jpdb-subtitle-list');
        return player?.dataset.transcriptPlacement === expected
            && panel?.dataset.transcriptPlacement === expected
            && panel.querySelector(`[data-action="transcript-placement"][data-placement="${expected}"][aria-pressed="true"]`);
    }, placement, { timeout: 5000 });
}

async function runYouTubeWithFallback(browser) {
    if (useYouTubeFixture) {
        return runPlacementVariants(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            route: installYouTubeFixtureRoutes,
            minRows: 3,
            readyTimeout: 30000,
            anchorSelector: '#movie_player',
        });
    }
    try {
        return await runPlacementVariants(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            youtubeConsent: true,
            ignoreBlockingDialogs: true,
            anchorSelector: '#movie_player',
            readyTimeout: 50000,
        });
    } catch (error) {
        const fallback = await runPlacementVariants(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            route: installYouTubeFixtureRoutes,
            minRows: 3,
            readyTimeout: 30000,
            anchorSelector: '#movie_player',
        });
        return fallback.map(result => ({ ...result, fallbackReason: error instanceof Error ? error.message : String(error) }));
    }
}

async function runPlacementVariants(browser, site) {
    const results = [];
    for (const placement of transcriptPlacements) {
        results.push(await runSite(browser, siteWithPlacement(site, placement)));
    }
    return results;
}

function siteWithPlacement(site, placement) {
    return {
        ...site,
        name: `${site.name}-${placement}`,
        expectPlacement: site.expectPlacementOverrides?.[placement] ?? placement,
        settings: {
            ...(site.settings ?? {}),
            subtitleTranscriptPlacement: placement,
        },
    };
}

rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

const fixture = await startFixtureServer();
const browser = await chromium.launch({ headless: !headed });
try {
    const sites = [
        ...transcriptPlacements.map(placement => siteWithPlacement({
            name: 'generic',
            url: `${fixture.origin}/generic`,
            viewport: { width: 1600, height: 950 },
            expectNativeCaptions: true,
            anchorSelector: '.player',
        }, placement)),
        {
            name: 'generic-mobile',
            url: `${fixture.origin}/generic`,
            viewport: { width: 390, height: 844 },
            expectPlacement: 'bottom',
            expectEdgeToEdgePanel: true,
            expectNativeCaptions: true,
            settings: { subtitleTranscriptPlacement: 'right' },
            anchorSelector: '.player',
        },
        {
            name: 'generic-docking',
            url: `${fixture.origin}/generic`,
            viewport: { width: 1600, height: 950 },
            expectPlacement: 'right',
            expectNativeCaptions: true,
            exerciseDockingControls: true,
            settings: { subtitleTranscriptPlacement: 'right' },
            anchorSelector: '.player',
        },
        ...transcriptPlacements.map(placement => siteWithPlacement({
            name: 'cij',
            url: 'https://cijapanese.com/video/560',
            viewport: { width: 2048, height: 1050 },
            route: installFixtureRoutes,
            expectNativeCaptions: true,
            anchorSelector: '.video-card',
        }, placement)),
        {
            name: 'youtube-mobile',
            url: 'https://m.youtube.com/watch?v=_fXQ8TquRWo&list=PLx5DSNMsjO9hJx2kV5JegcddNqQZtj34d&index=5&pp=iAQB&ra=m',
            viewport: { width: 980, height: 844 },
            route: installMobileYouTubeFixtureRoutes,
            minRows: 3,
            readyTimeout: 30000,
            anchorSelector: '#movie_player',
            expectClosedRailTappable: true,
            settings: { subtitleTranscriptPlacement: 'right' },
        },
    ];
    const results = [];
    for (const site of sites) results.push(await runSite(browser, site));
    results.push(...await runYouTubeWithFallback(browser));
    console.log(JSON.stringify({ artifactsDir, results }, null, 2));
} finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
}
