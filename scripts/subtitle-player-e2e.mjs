import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const userscriptPath = resolve(process.env.YOMU_E2E_USERSCRIPT ?? 'dist/yomu.user.js');
const artifactsDir = resolve(process.env.YOMU_E2E_ARTIFACTS ?? 'artifacts/subtitle-e2e/latest');
const youtubeUrl = process.env.YOMU_E2E_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=5050s';
const fixtureVideoUrl = process.env.YOMU_E2E_VIDEO_URL ?? '';
const useYouTubeFixture = process.env.YOMU_E2E_YOUTUBE_FIXTURE === '1';
const headed = process.env.YOMU_E2E_HEADED === '1';

const primaryVtt = `WEBVTT

00:00:00.000 --> 00:00:04.000
この小人は立っています。

00:00:04.000 --> 00:00:08.000
それからカメラを持っています。

00:00:08.000 --> 00:00:12.000
でも多分、ガイドブックか地図ですかね。
`;

const nativeSrt = `1
00:00:00,000 --> 00:00:04,000
This little person is standing.

2
00:00:04,000 --> 00:00:08,000
Then they are holding a camera.
`;

const youtubeTimedText = `<timedtext><body>
<p t="5040000" d="3000"><s t="0">これは</s></p>
<p t="5043000" d="3000"><s t="0">これが</s></p>
<p t="5046000" d="3500"><s t="0">ルーターとデフォルトゲートウェイなら</s></p>
</body></timedtext>`;

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

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

function panelSizeDelta(before, after) {
    if (!before || !after) return 0;
    return Math.max(Math.abs(before.width - after.width), Math.abs(before.height - after.height));
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
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 22px; padding: 56px 24px 24px; box-sizing: border-box; }
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
    <div id="page">
      <div id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}></video>
            <div class="caption-window"><span class="ytp-caption-segment">ルーターと同じ</span></div>
          </div>
        </div></div></div>
      </div>
      <aside><h2>Recommended</h2><p>Sidebar content</p></aside>
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

async function startFixtureServer() {
    const server = http.createServer((req, res) => {
        const origin = `http://${req.headers.host}`;
        const url = new URL(req.url ?? '/', origin);
        if (url.pathname === '/generic') return send(res, genericHtml(origin), 'text/html');
        if (url.pathname === '/primary.vtt') return send(res, primaryVtt, 'text/vtt');
        if (url.pathname === '/native.srt') return send(res, nativeSrt, 'text/plain');
        send(res, 'not found', 'text/plain', 404);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return { server, origin: `http://127.0.0.1:${address.port}` };
}

function send(res, body, contentType, status = 200) {
    res.writeHead(status, { 'content-type': `${contentType}; charset=utf-8`, 'access-control-allow-origin': '*' });
    res.end(body);
}

async function ensureUserscript(page) {
    if (await page.locator('.jpdb-subtitle-player').count()) return;
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

async function installFixtureRoutes(page) {
    await page.route('https://cijapanese.com/video/560**', route => route.fulfill({ body: cijHtml(), contentType: 'text/html' }));
    await page.route('https://cijapanese.com/media/subtitles.vtt**', route => route.fulfill({ body: primaryVtt, contentType: 'text/vtt' }));
    await page.route('https://cijapanese.com/media/native.srt**', route => route.fulfill({ body: nativeSrt, contentType: 'text/plain' }));
}

async function installYouTubeFixtureRoutes(page) {
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({ body: youtubeFixtureHtml(), contentType: 'text/html' }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedText, contentType: 'text/xml' }));
}

async function openAndReady(page, site) {
    const yomuLogs = [];
    const errors = [];
    page.on('console', message => {
        const text = message.text();
        if (text.includes('[Yomu]')) yomuLogs.push(text);
        if (message.type() === 'error') errors.push(text);
    });
    page.on('pageerror', error => errors.push(error.message));

    if (site.route) await site.route(page);
    if (site.youtubeConsent) await installYouTubeConsentCookies(page);
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissBlockingOverlays(page);
    await page.evaluate(() => {
        try { localStorage.clear(); } catch {}
    });
    await ensureUserscript(page);
    await dismissBlockingOverlays(page);
    if (site.prepare) await site.prepare(page);
    await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.getBoundingClientRect().width > 240;
    }, null, { timeout: 20000 });
    await waitForSubtitleSurface(page, site);
    await assertDrawerModeControls(page);
    return { yomuLogs, errors };
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
    await page.waitForFunction(() => {
        const rows = document.querySelectorAll('.jpdb-subtitle-list-row').length;
        const tracks = document.querySelectorAll('.jpdb-subtitle-track-row').length;
        return rows > 0 || tracks > 0 || document.querySelector('.jpdb-subtitle-status')?.textContent?.includes('subtitle');
    }, null, { timeout: site.readyTimeout ?? 25000 });

    await openTracksPanel(page);
    await maybeSelectFirstJapaneseTrack(page);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 0
        || Boolean(document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim())
        || document.querySelector('.jpdb-subtitle-track-row.active'), null, { timeout: site.readyTimeout ?? 25000 });
    await openLinesOrTracksPanel(page);
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
    await button.click({ force: true });
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
        await linesButton.click({ force: true });
        await waitForDrawerMode(page, 'lines');
    }

    await page.locator('.jpdb-subtitle-list [data-action="panel-tracks"]').first().click({ force: true });
    await waitForDrawerMode(page, 'tracks');
    await page.locator('.jpdb-subtitle-list [data-action="close-panel"]').first().click({ force: true });
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
    await openTracksPanel(page);
}

async function waitForDrawerMode(page, mode) {
    await page.waitForFunction(expectedMode => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel || panel.hidden) return false;
        const className = expectedMode === 'lines' ? 'jpdb-subtitle-lines-panel' : 'jpdb-subtitle-tracks-panel';
        const pressed = panel.querySelector(`[data-action="panel-${expectedMode}"][aria-pressed="true"]`);
        return panel.classList.contains(className) && Boolean(pressed);
    }, mode, { timeout: 5000 });
}

async function openTracksPanel(page) {
    const alreadyOpenTracks = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        const tracks = panel?.querySelector('[data-action="panel-tracks"][aria-pressed="true"]');
        return Boolean(panel && !panel.hidden && tracks);
    });
    if (alreadyOpenTracks) return;
    await page.locator('.jpdb-subtitle-rail [data-action="tracks"]').click({ force: true });
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
}

async function openLinesOrTracksPanel(page) {
    const canOpenLines = await page.locator('.jpdb-subtitle-rail [data-action="list"]').evaluate(button => {
        const element = button;
        return !element.hidden && !(element instanceof HTMLButtonElement && element.disabled) && getComputedStyle(element).display !== 'none';
    }).catch(() => false);
    if (canOpenLines) {
        const alreadyOpenLines = await page.evaluate(() => {
            const panel = document.querySelector('.jpdb-subtitle-list');
            const lines = panel?.querySelector('[data-action="panel-lines"][aria-pressed="true"]');
            return Boolean(panel && !panel.hidden && lines);
        });
        if (alreadyOpenLines) return;
        await page.locator('.jpdb-subtitle-rail [data-action="list"]').click({ force: true });
    } else {
        await openTracksPanel(page);
        return;
    }
    await page.waitForFunction(() => !document.querySelector('.jpdb-subtitle-list')?.hidden, null, { timeout: 5000 });
}

async function resizePanel(page, placement) {
    const handle = await page.locator('[data-resize-transcript]').boundingBox();
    if (!handle) return false;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (placement === 'bottom') {
        await page.mouse.move(x, y - 120, { steps: 6 });
    } else if (placement === 'left') {
        await page.mouse.move(x + 140, y, { steps: 6 });
    } else {
        await page.mouse.move(x - 140, y, { steps: 6 });
    }
    await page.mouse.up();
    await page.waitForTimeout(350);
    return true;
}

async function snapshot(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const moviePlayer = document.querySelector('#movie_player');
        const video = moviePlayer || document.querySelector('video');
        const videoRect = video?.getBoundingClientRect();
        const root = document.querySelector('.jpdb-subtitle-player');
        const nativeCaption = document.querySelector('.caption-window');
        const nativeStyle = nativeCaption ? getComputedStyle(nativeCaption) : undefined;
        return {
            placement: root?.dataset.transcriptPlacement ?? '',
            panel: panel?.toJSON(),
            video: videoRect?.toJSON(),
            rows: document.querySelectorAll('.jpdb-subtitle-list-row').length,
            tracks: document.querySelectorAll('.jpdb-subtitle-track-row').length,
            yomuCaptionsActive: document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active'),
            nativeCaptionVisible: nativeCaption ? nativeStyle?.display !== 'none' && nativeStyle?.visibility !== 'hidden' : true,
            blockingDialogVisible: [...document.querySelectorAll('[role="dialog"], tp-yt-paper-dialog')]
                .some(element => /Before you continue|cookies and data|Sign in to confirm/i.test(element.textContent ?? '')
                    && getComputedStyle(element).display !== 'none'
                    && getComputedStyle(element).visibility !== 'hidden'),
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
    });
}

async function exerciseDrawerLayout(page, site) {
    const results = [];
    for (const phase of ['initial', 'resized']) {
        results.push(await exerciseDrawerLayoutPhase(page, site, phase));
    }
    return results;
}

async function exerciseDrawerLayoutPhase(page, site, phase) {
    const resize = await prepareDrawerLayoutPhase(page, phase);
    const state = await snapshot(page);
    const layout = drawerLayoutRects(state, phase);
    assertDrawerLayoutState(site, phase, state, layout);
    assertDrawerResize(site, phase, resize, layout, state);
    assertExpectedSubtitleState(site, phase, state);
    const screenshot = await writeDrawerScreenshot(page, site, phase);
    return drawerLayoutResult(phase, layout.placement, resize.resized, screenshot, state);
}

async function prepareDrawerLayoutPhase(page, phase) {
    await openLinesOrTracksPanel(page);
    if (phase !== 'resized') return { beforeResizePanel: undefined, resized: false };
    const beforeResize = await snapshot(page);
    const beforeResizePanel = rectFromJson(beforeResize.panel);
    const resized = await resizePanel(page, beforeResize.placement || 'right');
    return { beforeResizePanel, resized };
}

function drawerLayoutRects(state, phase) {
    return {
        placement: state.placement || phase,
        panel: rectFromJson(state.panel),
        video: rectFromJson(state.video),
    };
}

function assertDrawerLayoutState(site, phase, state, layout) {
    assert(hasTranscriptPanel(layout.panel), `${site.name}: missing transcript panel during ${phase}`, state);
    assert(hasUsableVideo(layout.video), `${site.name}: missing usable video during ${phase}`, state);
    assert(!rectsOverlap(layout.panel, layout.video), `${site.name}: transcript panel overlaps video during ${phase}`, state);
    assert(panelFitsViewport(layout.panel, state.viewport), `${site.name}: transcript panel leaves viewport during ${phase}`, state);
    assert(!state.blockingDialogVisible, `${site.name}: blocking page dialog is covering the verification screenshot`, state);
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

function assertDrawerResize(site, phase, resize, layout, state) {
    if (phase !== 'resized') return;
    assert(resize.resized, `${site.name}: transcript drawer resize handle was not available`, state);
    assert(panelSizeDelta(resize.beforeResizePanel, layout.panel) >= 24, `${site.name}: transcript drawer did not resize`, {
        beforeResizePanel: resize.beforeResizePanel,
        afterResizePanel: layout.panel,
        placement: layout.placement,
    });
}

function assertExpectedSubtitleState(site, phase, state) {
    if (site.expectRows !== false) assert(state.rows > 0, `${site.name}: transcript lines did not render during ${phase}`, state);
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
        const telemetry = await openAndReady(page, site);
        const layouts = await exerciseDrawerLayout(page, site);
        return {
            site: site.name,
            url: site.url,
            layouts,
            yomuLogCount: telemetry.yomuLogs.length,
            pageErrors: telemetry.errors.slice(0, 5),
        };
    } finally {
        await page.close();
    }
}

async function runYouTubeWithFallback(browser) {
    if (useYouTubeFixture) {
        return runSite(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            route: installYouTubeFixtureRoutes,
            readyTimeout: 30000,
        });
    }
    try {
        return await runSite(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            youtubeConsent: true,
            readyTimeout: 50000,
        });
    } catch (error) {
        const fallback = await runSite(browser, {
            name: 'youtube',
            url: youtubeUrl,
            viewport: { width: 2048, height: 1050 },
            route: installYouTubeFixtureRoutes,
            readyTimeout: 30000,
        });
        return { ...fallback, fallbackReason: error instanceof Error ? error.message : String(error) };
    }
}

rmSync(artifactsDir, { recursive: true, force: true });
mkdirSync(artifactsDir, { recursive: true });

const fixture = await startFixtureServer();
const browser = await chromium.launch({ headless: !headed });
try {
    const sites = [
        {
            name: 'generic',
            url: `${fixture.origin}/generic`,
            viewport: { width: 1600, height: 950 },
            expectNativeCaptions: true,
        },
        {
            name: 'cij',
            url: 'https://cijapanese.com/video/560',
            viewport: { width: 2048, height: 1050 },
            route: installFixtureRoutes,
            expectNativeCaptions: true,
        },
    ];
    const results = [];
    for (const site of sites) results.push(await runSite(browser, site));
    results.push(await runYouTubeWithFallback(browser));
    console.log(JSON.stringify({ artifactsDir, results }, null, 2));
} finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
}
