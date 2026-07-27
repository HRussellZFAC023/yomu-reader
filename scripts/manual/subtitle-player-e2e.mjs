import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { assert } from '../lib/smoke-harness.mjs';
import { createYomuPaths } from '../lib/paths.mjs';
import { dragTranscriptResizeHandle, panelSizeDelta } from '../lib/subtitle-layout-test-utils.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from '../fixtures/youtube-fixtures.mjs';

const { qaArtifactsRoot } = createYomuPaths(import.meta.dirname);
const userscriptPath = resolve(process.env.YOMU_E2E_USERSCRIPT ?? 'dist/yomu.user.js');
const videoCompanionPath = resolve(process.env.YOMU_E2E_VIDEO_COMPANION ?? 'dist/greasyfork/yomu-video.user.js');
const readerCssPath = resolve(process.env.YOMU_E2E_READER_CSS ?? 'dist/yomu.css');
const artifactsDir = resolve(process.env.YOMU_E2E_ARTIFACTS ?? join(qaArtifactsRoot, 'subtitle-e2e/latest'));
const youtubeUrl = process.env.YOMU_E2E_YOUTUBE_URL ?? 'https://www.youtube.com/watch?v=TAorfFcb8_g&t=5050s';
const fixtureVideoUrl = process.env.YOMU_E2E_VIDEO_URL ?? '';
const useYouTubeFixture = process.env.YOMU_E2E_YOUTUBE_FIXTURE === '1';
const headed = process.env.YOMU_E2E_HEADED === '1';
const siteFilters = (process.env.YOMU_E2E_SITE_FILTER ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
const settingsStorageKey = 'jpdb-popup-reader-settings';
const transcriptPlacements = ['right', 'left', 'bottom'];
const baseE2ESettings = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    preferJapaneseSiteLanguage: false,
    showFloatingButton: false,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleControlsMode: 'auto',
};
const defaultSubtitleBottomOffset = 16;

function shouldRunSite(name) {
    return siteFilters.length === 0 || siteFilters.some(filter => name.includes(filter));
}

const shortPrimaryCue = 'この小人は立っています。';
const longPrimaryCue = 'これはとても長い日本語字幕の行で、狭い横幅の文字起こしパネルでもはみ出さずに折り返される必要があります。';
const longPrimaryCueFirstSegment = 'これはとても長い日本語字幕の行で、狭い横幅の文字起こしパネルでも';
const longPrimaryCueSecondSegment = 'はみ出さずに折り返される必要があります。';
const primaryVtt = `WEBVTT

00:00:00.000 --> 00:00:04.000
${shortPrimaryCue}

00:00:04.000 --> 00:00:08.000
それからカメラを持っています。

00:00:08.000 --> 00:00:12.000
でも多分、ガイドブックか地図ですかね。

00:00:12.000 --> 00:00:18.000
${longPrimaryCue}
`;

const nativeSrt = `1
00:00:00,000 --> 00:00:04,000
This little person is standing.

2
00:00:04,000 --> 00:00:08,000
Then they are holding a camera.

3
00:00:12,000 --> 00:00:18,000
A long native subtitle stays in its reserved bottom row.
`;

const youtubeTimedTextFixture = youtubeTimedText([
    { start: 5040000, duration: 2000, text: 'これは一つ目です。' },
    { start: 5044000, duration: 2200, text: '次の行も表示します。' },
    { start: 5049000, duration: 2400, text: '前後の行を保ちます。' },
    { start: 5054000, duration: 2600, text: 'これは狭いサイドバーでも折り返して読める長い字幕行です。' },
]);

const FIXTURE_ROUTES = new Map([
    ['/generic', origin => ({ body: genericHtml(origin), contentType: 'text/html' })],
    ['/bbc', origin => ({ body: playerEngineHtml(origin, {
        title: 'BBC article player fixture',
        className: 'bbc-media-player',
        controlClass: 'bbc-player-controls',
        videoWidth: '46%',
        bodyClass: 'fixture-news-page',
        heading: 'I have a duty to stay on, says PM',
        aside: 'Article text and ads sit outside the player frame.',
    }), contentType: 'text/html' })],
    ['/videojs', origin => ({ body: playerEngineHtml(origin, {
        title: 'Video.js player fixture',
        className: 'video-js vjs-default-skin vjs-paused',
        controlClass: 'vjs-control-bar',
        videoWidth: '100%',
        bodyClass: 'fixture-library-page',
        heading: 'Video.js lesson player',
        aside: 'Controls are an overlay inside a same-size player wrapper.',
    }), contentType: 'text/html' })],
    ['/jwplayer', origin => ({ body: playerEngineHtml(origin, {
        title: 'JW Player fixture',
        className: 'jwplayer jw-state-paused',
        controlClass: 'jw-controls jw-reset',
        videoWidth: '72%',
        bodyClass: 'fixture-library-page',
        heading: 'JW Player centered media',
        aside: 'The video is centered inside a larger black player frame.',
    }), contentType: 'text/html' })],
    ['/plyr', origin => ({ body: playerEngineHtml(origin, {
        title: 'Plyr player fixture',
        className: 'plyr plyr--video plyr--stopped',
        controlClass: 'plyr__controls',
        videoWidth: '100%',
        bodyClass: 'fixture-library-page',
        heading: 'Plyr accessible controls',
        aside: 'The wrapper and video share a rect; controls still move with the frame.',
    }), contentType: 'text/html' })],
    ['/vimeo', origin => ({ body: playerEngineHtml(origin, {
        title: 'Vimeo-style player fixture',
        className: 'vimeo-player vp-player',
        controlClass: 'vp-controls',
        videoWidth: '100%',
        bodyClass: 'fixture-embed-page',
        heading: 'Vimeo-style embed',
        aside: 'A custom embed wrapper exposes controls outside the video element.',
    }), contentType: 'text/html' })],
    ['/wistia', origin => ({ body: playerEngineHtml(origin, {
        title: 'Wistia-style player fixture',
        className: 'wistia_embed wistia-player',
        controlClass: 'w-control-bar',
        videoWidth: '82%',
        bodyClass: 'fixture-marketing-page',
        heading: 'Wistia-style marketing video',
        aside: 'Letterboxed media and marketing content should not steal the anchor.',
    }), contentType: 'text/html' })],
    ['/mux', origin => ({ body: playerEngineHtml(origin, {
        title: 'Mux/Kaltura-style player fixture',
        className: 'mux-player kaltura-player playback-shell',
        controlClass: 'media-controls',
        videoWidth: '100%',
        bodyClass: 'fixture-course-page',
        heading: 'Course player with custom chrome',
        aside: 'The player shell resizes while captions auto-detect from the track.',
    }), contentType: 'text/html' })],
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

function playerEngineHtml(origin, fixture) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${fixture.title}</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #f6f7f9; color: #17202a; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body.fixture-news-page { font-family: Georgia, "Times New Roman", serif; }
    body.fixture-library-page { background: #101923; color: #e9f1fb; }
    body.fixture-embed-page { background: #111; color: white; }
    body.fixture-marketing-page { background: #f2f1ed; color: #20242a; }
    body.fixture-course-page { background: #10201c; color: #eaf5ef; }
    main { display: grid; grid-template-columns: minmax(520px, 1fr) 340px; gap: 28px; align-items: start; padding: 44px; box-sizing: border-box; }
    h1 { margin: 0 0 24px; font-size: clamp(30px, 4vw, 58px); line-height: 1.05; letter-spacing: 0; }
    .copy { margin-top: 20px; max-width: 720px; font-size: 21px; line-height: 1.55; }
    aside { min-height: 680px; padding: 22px; border: 1px solid rgba(90, 110, 132, .28); background: rgba(255, 255, 255, .08); color: inherit; }
    .site-player { position: relative; width: min(1040px, calc(100vw - 456px)); min-width: 420px; aspect-ratio: 16 / 9; overflow: hidden; background: #020304; border: 1px solid rgba(120, 137, 160, .42); box-shadow: 0 18px 48px rgba(0, 0, 0, .22); }
    .site-player video { position: absolute; top: 0; bottom: 0; left: 50%; display: block; width: var(--fixture-video-width); height: 100%; transform: translateX(-50%); object-fit: cover; background: #030405; }
    .site-player .caption-window { position: absolute; left: 16%; right: 16%; bottom: 74px; color: white; text-align: center; font: 700 26px/1.35 system-ui, sans-serif; text-shadow: 0 2px 4px black, 0 0 8px black; }
    .site-player .fixture-controls { position: absolute; left: 0; right: 0; bottom: 0; height: 54px; display: flex; align-items: center; gap: 14px; padding: 0 18px; box-sizing: border-box; background: linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.18)); color: white; font: 600 13px/1 system-ui, sans-serif; }
    .site-player .fixture-controls button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255,255,255,.18); color: white; font: inherit; }
    .site-player .fixture-progress { flex: 1; height: 5px; border-radius: 999px; background: rgba(255,255,255,.24); overflow: hidden; }
    .site-player .fixture-progress::before { content: ""; display: block; width: 28%; height: 100%; background: #fff; }
    @media (max-width: 760px) {
      main { display: block; padding: 0; }
      h1, .copy, aside { display: none; }
      .site-player { width: 100vw; min-width: 0; border: 0; }
    }
  </style>
</head>
<body class="${fixture.bodyClass}">
  <main>
    <article>
      <h1>${fixture.heading}</h1>
      <section class="site-player ${fixture.className}" style="--fixture-video-width: ${fixture.videoWidth}">
        <video muted preload="metadata" ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}>
          <track kind="subtitles" srclang="ja-JP" label="日本語" src="${origin}/primary.vtt" default>
        </video>
        <div class="caption-window">この小人は立っています。</div>
        <div class="fixture-controls ${fixture.controlClass}">
          <button type="button" aria-label="Play">&gt;</button>
          <div class="fixture-progress" role="slider" aria-label="Seek"></div>
          <button type="button" aria-label="Captions">CC</button>
        </div>
      </section>
      <p class="copy">This surrounding page deliberately looks unlike YouTube and CIJ. Yomu should bind to the media frame and load the Japanese subtitle track without depending on a host-specific rule.</p>
    </article>
    <aside>${fixture.aside}</aside>
  </main>
  <script>
    (() => {
      const track = document.querySelector('video')?.textTracks?.[0];
      if (!track || !window.VTTCue) return;
      track.mode = 'hidden';
      const cues = [
        [0, 4, 'この小人は立っています。'],
        [4, 8, 'それからカメラを持っています。'],
        [8, 12, 'でも多分、ガイドブックか地図ですかね。'],
        [12, 18, 'これはとても長い日本語字幕の行で、狭い横幅の文字起こしパネルでもはみ出さずに折り返される必要があります。'],
      ];
      for (const [start, end, text] of cues) {
        try { track.addCue(new VTTCue(start, end, text)); } catch {}
      }
      window.__fixtureTrackState = {
        tracks: document.querySelector('video')?.textTracks?.length ?? 0,
        cues: track.cues?.length ?? 0,
        mode: track.mode,
      };
    })();
  </script>
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
    .video-card { background: #16283a; border: 1px solid #243e56; }
    .lesson-player { position: relative; background: #050607; }
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
      <div class="lesson-player">
        <video controls muted preload="metadata" ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}>
          <track kind="subtitles" srclang="ja-JP" label="日本語" src="https://cijapanese.com/media/subtitles.vtt?filename=%E5%B0%8F%E4%BA%BA.vtt&v=123" default>
        </video>
        <div class="caption-window">この小人は立っています。</div>
      </div>
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
    await addUserscriptFile(page, videoCompanionPath);
    await addUserscriptFile(page, userscriptPath);
    await page.waitForSelector('.jpdb-subtitle-player', { state: 'attached', timeout: 10000 });
}

async function addUserscriptFile(page, scriptPath) {
    try {
        await page.addScriptTag({ path: scriptPath });
    } catch {
        const client = await page.context().newCDPSession(page);
        await client.send('Runtime.evaluate', {
            expression: readFileSync(scriptPath, 'utf8'),
            awaitPromise: false,
            allowUnsafeEvalBlockedByCSP: true,
            replMode: true,
        });
    }
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
            window.GM_getValue = (key, fallback) => {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                try { return JSON.parse(raw); } catch { return raw; }
            };
            window.GM_setValue = (key, value) => {
                localStorage.setItem(key, JSON.stringify(value));
            };
            window.GM_deleteValue = key => {
                localStorage.removeItem(key);
            };
            window.GM_listValues = () => Object.keys(localStorage);
            window.GM_xmlhttpRequest = options => {
                const controller = new AbortController();
                fetch(options.url, {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.data,
                    signal: controller.signal,
                }).then(async response => {
                    const responseText = await response.text();
                    options.onload?.({
                        status: response.status,
                        statusText: response.statusText,
                        response,
                        responseText,
                        finalUrl: response.url,
                        responseHeaders: '',
                    });
                }).catch(error => options.onerror?.(error));
                return { abort: () => controller.abort() };
            };
            window.GM = {
                getValue: async (key, fallback) => window.GM_getValue(key, fallback),
                setValue: async (key, value) => window.GM_setValue(key, value),
                deleteValue: async key => window.GM_deleteValue(key),
                listValues: async () => window.GM_listValues(),
                addStyle: window.GM_addStyle,
                getResourceText: async name => window.GM_getResourceText(name),
                xmlHttpRequest: window.GM_xmlhttpRequest,
                xmlhttpRequest: window.GM_xmlhttpRequest,
            };
            window.GM_info = { script: { version: '0.0.0-e2e' }, scriptHandler: 'yomu-e2e' };
            window.unsafeWindow = window;
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
    await page.route('https://www.youtube.com/watch**', route => route.fulfill({
        body: youtubeWatchHtml({
            fixture: 'subtitle-e2e',
            mobile: false,
            fixtureVideoUrl,
            playerResponse: youtubePlayerResponse('TAorfFcb8_g', {
                captionTracks: [{ languageCode: 'ja', vssId: null, name: 'Japanese' }],
            }),
        }),
        contentType: 'text/html',
    }));
    await page.route('https://www.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedTextFixture, contentType: 'text/xml' }));
}

async function installMobileYouTubeFixtureRoutes(page) {
    await page.route('https://m.youtube.com/watch**', route => route.fulfill({
        body: youtubeWatchHtml({
            fixture: 'subtitle-e2e',
            mobile: true,
            fixtureVideoUrl,
            playerResponse: youtubePlayerResponse('_fXQ8TquRWo', {
                host: 'm',
                captionTracks: [{ languageCode: 'ja', vssId: null, name: 'Japanese' }],
            }),
        }),
        contentType: 'text/html',
    }));
    await page.route('https://m.youtube.com/api/timedtext**', route => route.fulfill({ body: youtubeTimedTextFixture, contentType: 'text/xml' }));
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
        localStorage.setItem(key, JSON.stringify({ ...value.base, ...value.site }));
    }, { key: settingsStorageKey, value: { base: baseE2ESettings, site: settings } });
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
    const timeout = subtitleReadyTimeout(site);
    await page.waitForFunction(subtitleSurfaceReady, null, { timeout });
    await assertClosedRailWhenRequested(page, site);

    // Auto-mode rails can already be idle by the time track discovery finishes.
    // Wake the real control surface before asking Playwright to click it.
    await revealSubtitleControls(page, site);
    await openTracksPanel(page);
    await maybeSelectFirstJapaneseTrack(page);
    await waitForSubtitleContent(page, site, timeout);
    await openLinesOrTracksPanel(page);
    await waitForTranscriptRowsWhenExpected(page, site, timeout);
}

function subtitleReadyTimeout(site) {
    return site.readyTimeout ?? 25000;
}

async function assertClosedRailWhenRequested(page, site) {
    if (!site.expectClosedRailTappable) return;
    await revealSubtitleControls(page, site);
    await assertClosedRailPanelButton(page, site);
}

async function waitForSubtitleContent(page, site, timeout) {
    const ready = site.expectRows === false ? subtitleLinesReady : subtitleCueRowsReady;
    await page.waitForFunction(ready, null, { timeout });
}

async function waitForTranscriptRowsWhenExpected(page, site, timeout) {
    if (site.expectRows === false) return;
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-subtitle-list-row').length > 0, null, { timeout });
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

function subtitleCueRowsReady() {
    return document.querySelectorAll('.jpdb-subtitle-list-row').length > 0
        || Boolean(document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim());
}

async function maybeSelectFirstJapaneseTrack(page) {
    const rows = await page.locator('.jpdb-subtitle-list-row').count();
    if (rows) return;
    const namedJapanese = page.locator('.jpdb-subtitle-track-row').filter({ hasText: /Japanese|日本語/i }).first();
    if (await namedJapanese.count()) {
        await pressPrimaryTrackIfNeeded(namedJapanese);
        return;
    }
    const languageCodeJapanese = page.locator('.jpdb-subtitle-track-row').filter({ hasText: /\bJA(?:-JP)?\b/i }).first();
    if (!await languageCodeJapanese.count()) return;
    await pressPrimaryTrackIfNeeded(languageCodeJapanese);
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
    const optionsToggles = await page.locator('.jpdb-subtitle-list [data-action="panel-options"]').count();
    assert(optionsToggles === 1, 'drawer header should expose a single panel-options menu toggle', { optionsToggles });
    const closeButtons = await page.locator('.jpdb-subtitle-list [data-action="close-panel"]').count();
    assert(closeButtons === 1, 'panel-options menu should carry the close action', { closeButtons });
    const placementButtons = await page.locator('.jpdb-subtitle-list [data-action="transcript-placement"][data-placement]').count();
    assert(placementButtons === 3, 'panel-options menu should expose left, below, and right dock controls', { placementButtons });
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
    await switchOpenPanelToLines(page);
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
    const metrics = await handleLocator.evaluate(handle => ({
        max: Number(handle.getAttribute('aria-valuemax') ?? '0'),
        now: Number(handle.getAttribute('aria-valuenow') ?? '0'),
    })).catch(() => ({ max: 0, now: 0 }));
    const startsAtMax = metrics.max > 0 && metrics.now >= metrics.max - 2;
    if (placement === 'left') {
        await handleLocator.focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(350);
        return true;
    }
    if (placement === 'right' && startsAtMax) return dragTranscriptResizeHandle(page, placement, { rightDelta: 140 });
    if (placement === 'bottom' && startsAtMax) return dragTranscriptResizeHandle(page, placement, { bottomDelta: 120 });
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
                trackRows: trackRowSnapshot(),
                fixtureTrackState: globalThis.__fixtureTrackState ?? null,
                videoTextTracks: videoTextTrackSnapshot(),
                panelMode: panelMode(document.querySelector('.jpdb-subtitle-list')),
                primaryText: document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim() ?? '',
                linesButtonDisabled: linesButtonDisabled(),
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

        function trackRowSnapshot() {
            return [...document.querySelectorAll('.jpdb-subtitle-track-row')].map((row, index) => ({
                index,
                text: row.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
                active: row.classList.contains('active'),
                primaryPressed: row.querySelector('[data-action="primary-track"]')?.getAttribute('aria-pressed') ?? '',
            }));
        }

        function panelMode(panel) {
            if (!panel || panel.hidden) return '';
            if (panel.classList.contains('jpdb-subtitle-lines-panel')) return 'lines';
            if (panel.classList.contains('jpdb-subtitle-tracks-panel')) return 'tracks';
            return 'open';
        }

        function linesButtonDisabled() {
            const button = document.querySelector('.jpdb-subtitle-list [data-action="panel-lines"]');
            return button instanceof HTMLButtonElement ? button.disabled : null;
        }

        function videoTextTrackSnapshot() {
            return [...document.querySelectorAll('video')].flatMap((video, videoIndex) => [...video.textTracks].map((track, trackIndex) => ({
                videoIndex,
                trackIndex,
                label: track.label,
                language: track.language,
                mode: track.mode,
                cues: track.cues?.length ?? 0,
                activeCues: track.activeCues?.length ?? 0,
            })));
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
    await page.waitForFunction(({ anchorSelector, expectedPlacement }) => {
        const panel = document.querySelector('.jpdb-subtitle-list')?.getBoundingClientRect();
        const player = playerRect(anchorSelector);
        if (!panel || !player) return false;
        if (!hasSubtitlePanelContent()) return false;
        const placement = document.querySelector('.jpdb-subtitle-list')?.dataset.transcriptPlacement
            || document.querySelector('.jpdb-subtitle-player')?.dataset.transcriptPlacement
            || expectedPlacement;
        if (placement === 'bottom') return bottomSheetSettled(panel);
        return boxesSeparated(panel, player);

        function playerRect(anchorSelector) {
            if (anchorSelector) return document.querySelector(anchorSelector)?.getBoundingClientRect();
            const moviePlayer = document.querySelector('#movie_player');
            return (moviePlayer || document.querySelector('video'))?.getBoundingClientRect();
        }

        function hasSubtitlePanelContent() {
            const rows = document.querySelectorAll('.jpdb-subtitle-list-row').length;
            const tracks = document.querySelectorAll('.jpdb-subtitle-track-row').length;
            return rows > 0 || tracks > 0;
        }

        function bottomSheetSettled(panel) {
            return panel.left >= -1
                && panel.right <= window.innerWidth + 1
                && panel.bottom >= window.innerHeight - 1
                && panel.height >= 80;
        }

        function boxesSeparated(panel, video) {
            return [
                panel.right <= video.left + 1,
                video.right <= panel.left + 1,
                panel.bottom <= video.top + 1,
                video.bottom <= panel.top + 1,
            ].some(Boolean);
        }
    }, { anchorSelector: site.anchorSelector ?? '', expectedPlacement: site.expectPlacement ?? '' }, { timeout: site.readyTimeout ?? 25000 });
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
    if (layout.placement !== 'bottom') {
        assert(!rectsOverlap(layout.panel, layout.video), `${site.name}: transcript panel overlaps video during ${phase}`, state);
        if (layout.anchor) assert(!rectsOverlap(layout.panel, layout.anchor), `${site.name}: transcript panel overlaps player frame during ${phase}`, {
            placement: layout.placement,
            panel: layout.panel,
            anchor: layout.anchor,
            video: layout.video,
            viewport: state.viewport,
        });
    }
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
        assert(isEdgeToEdgePanel(layout.panel, state.viewport), `${site.name}: bottom transcript panel is not a viewport sheet during ${phase}`, state);
        assert(layout.panel.bottom >= state.viewport.height - 1, `${site.name}: bottom transcript panel is not flush to the viewport edge during ${phase}`, state);
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
    const context = await browser.newContext({ viewport: site.viewport, locale: 'en-GB' });
    const page = await context.newPage();
    try {
        return await collectSiteResult(page, site);
    } catch (error) {
        console.error(`[subtitle-e2e] ${site.name} failed: ${errorMessage(error)}`);
        throw error;
    } finally {
        await context.close();
    }
}

async function collectSiteResult(page, site) {
    console.error(`[subtitle-e2e] ${site.name}`);
    const telemetry = await openAndReady(page, site);
    const optionalEvidence = await exerciseOptionalSiteFlows(page, site);
    const layouts = await exerciseDrawerLayout(page, site);
    return {
        site: site.name,
        url: site.url,
        layouts,
        ...optionalEvidence,
        yomuLogCount: telemetry.yomuLogs.length,
        pageErrors: telemetry.errors.slice(0, 5),
    };
}

async function exerciseOptionalSiteFlows(page, site) {
    const evidence = {};
    if (site.exerciseFontPersistence) evidence.fontPersistence = await assertSubtitleFontPersistence(page, site);
    if (site.exerciseSubtitleDrag) await assertSubtitleMoveHandle(page, site);
    if (site.exerciseDockingControls) await assertDrawerDockingControls(page, site);
    return evidence;
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function readSubtitleFontState({ key, label }) {
    const root = document.querySelector('.jpdb-subtitle-player');
    const text = document.querySelector('.jpdb-subtitle-text');
    const lines = document.querySelector('.jpdb-subtitle-lines');
    const primary = document.querySelector('.jpdb-subtitle-primary');
    const secondary = document.querySelector('.jpdb-subtitle-secondary');
    return {
        label,
        saved: savedSubtitleFontSize(key),
        target: styleProperty(root, '--subtitle-font-size-target'),
        effective: styleProperty(root, '--subtitle-font-size'),
        computedText: computedFontSize(text),
        computedPrimary: computedFontSize(primary),
        cue: normalizedText(primary),
        surfaceCue: surfaceText(primary),
        viewport: { width: innerWidth, height: innerHeight },
        visibility: document.visibilityState,
        geometry: subtitleGeometry({ root, text, lines, primary, secondary }),
    };

    function savedSubtitleFontSize(storageKey) {
        const settings = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
        return settings.subtitleFontSize;
    }

    function styleProperty(element, property) {
        if (!(element instanceof HTMLElement)) return '';
        return element.style.getPropertyValue(property);
    }

    function computedFontSize(element) {
        if (!(element instanceof Element)) return '';
        return getComputedStyle(element).fontSize;
    }

    function normalizedText(element) {
        if (!(element instanceof Element)) return '';
        return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    function surfaceText(element) {
        if (!(element instanceof Element)) return '';
        const clone = element.cloneNode(true);
        clone.querySelectorAll('rt, rp').forEach(node => node.remove());
        return normalizedText(clone);
    }

    function subtitleGeometry(elements) {
        return Object.fromEntries(Object.entries(elements).map(([name, element]) => [name, elementRect(element)]));
    }

    function elementRect(element) {
        if (!(element instanceof Element)) return undefined;
        const value = element.getBoundingClientRect();
        return {
            top: value.top,
            right: value.right,
            bottom: value.bottom,
            left: value.left,
            width: value.width,
            height: value.height,
        };
    }
}

async function captureSubtitleFontState(page, site, checkpoints, label, options = {}) {
    const state = await page.evaluate(readSubtitleFontState, { key: settingsStorageKey, label });
    assertSubtitleFontSize(site, label, state);
    assertExpectedSurfaceCue(site, label, state, options.expectedSurface);
    assertSubtitleFontGeometry(site, label, state, options.expectUpwardOverflow);
    checkpoints.push(state);
    return state;
}

function assertSubtitleFontSize(site, label, state) {
    assert(state.saved === 60, `${site.name}: saved subtitle size changed during ${label}`, state);
    assert(state.target === '60px', `${site.name}: target subtitle size changed during ${label}`, state);
    assert(state.effective === '60px', `${site.name}: effective subtitle size changed during ${label}`, state);
    assert(state.computedText === '60px' && state.computedPrimary === '60px', `${site.name}: rendered subtitle size changed during ${label}`, state);
}

function assertExpectedSurfaceCue(site, label, state, expectedSurface) {
    if (!expectedSurface) return;
    assert(state.surfaceCue === expectedSurface, `${site.name}: rendered cue was truncated during ${label}`, state);
}

function assertSubtitleFontGeometry(site, label, state, expectUpwardOverflow) {
    const { root, text, lines, primary, secondary } = state.geometry;
    assert([root, text, lines, primary, secondary].every(Boolean), `${site.name}: subtitle geometry is incomplete during ${label}`, state);
    assert(lines.bottom <= text.bottom + 1.5, `${site.name}: subtitle rows escaped downward during ${label}`, state);
    assert(secondary.bottom <= root.bottom + 1.5, `${site.name}: native subtitle escaped the video during ${label}`, state);
    assert(primary.bottom <= secondary.top + 1.5, `${site.name}: primary subtitle consumed the native row during ${label}`, state);
    assertExpectedUpwardOverflow(site, label, state, expectUpwardOverflow);
}

function assertExpectedUpwardOverflow(site, label, state, expectUpwardOverflow) {
    if (!expectUpwardOverflow) return;
    const { primary, text } = state.geometry;
    assert(primary.top < text.top - 1.5, `${site.name}: an overlong cue did not extend upward during ${label}`, state);
}

async function showFontPersistenceCue(page, site, time, pattern) {
    await page.evaluate(value => {
        const video = document.querySelector('video');
        video.currentTime = value;
        video.dispatchEvent(new Event('seeking'));
        video.dispatchEvent(new Event('timeupdate'));
    }, time);
    await page.waitForFunction(source => new RegExp(source, 'u').test(
        document.querySelector('.jpdb-subtitle-primary')?.textContent ?? '',
    ), pattern.source, { timeout: subtitleReadyTimeout(site) });
    // Let deferred parsed/furigana HTML replace the plain cue before
    // measuring; that replacement used to run the shrinker a second time.
    await page.waitForTimeout(250);
}

async function assertSubtitleFontPersistence(page, site) {
    await closePanelIfOpen(page);
    const checkpoints = [];
    await showFontPersistenceCue(page, site, 1, /小人/u);
    await captureSubtitleFontState(page, site, checkpoints, 'short cue', { expectedSurface: shortPrimaryCue });
    await showFontPersistenceCue(page, site, 13, /とても長い/u);
    const firstLongSegment = await captureSubtitleFontState(page, site, checkpoints, 'long cue', {
        expectedSurface: longPrimaryCueFirstSegment,
        expectUpwardOverflow: true,
    });
    await showFontPersistenceCue(page, site, 16, /はみ出さず/u);
    const secondLongSegment = await captureSubtitleFontState(page, site, checkpoints, 'normalized cue continuation', {
        expectedSurface: longPrimaryCueSecondSegment,
    });
    assert(
        `${firstLongSegment.surfaceCue}${secondLongSegment.surfaceCue}` === longPrimaryCue,
        `${site.name}: normalized cue segments did not preserve the complete source cue`,
        { firstLongSegment, secondLongSegment, longPrimaryCue },
    );

    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 844, height: 390 });
    await showFontPersistenceCue(page, site, 13, /とても長い/u);
    await page.waitForTimeout(250);
    await captureSubtitleFontState(page, site, checkpoints, 'landscape resize', {
        expectedSurface: longPrimaryCueFirstSegment,
        expectUpwardOverflow: true,
    });

    await page.evaluate(() => {
        window.__yomuSubtitleE2EVisibilityHistory = [document.visibilityState];
        window.__yomuSubtitleE2EVisibilityDescriptors = {
            hidden: Object.getOwnPropertyDescriptor(document, 'hidden'),
            visibilityState: Object.getOwnPropertyDescriptor(document, 'visibilityState'),
        };
        document.addEventListener('visibilitychange', () => {
            window.__yomuSubtitleE2EVisibilityHistory.push(document.visibilityState);
        });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(250);
    const visibilityHistory = await page.evaluate(() => window.__yomuSubtitleE2EVisibilityHistory);
    assert(
        visibilityHistory.includes('hidden') && visibilityHistory.at(-1) === 'visible',
        `${site.name}: visibility lifecycle did not hide and restore the video page`,
        { visibilityHistory },
    );
    await captureSubtitleFontState(page, site, checkpoints, 'tab return', {
        expectedSurface: longPrimaryCueFirstSegment,
        expectUpwardOverflow: true,
    });
    await page.evaluate(() => {
        const descriptors = window.__yomuSubtitleE2EVisibilityDescriptors;
        for (const property of ['hidden', 'visibilityState']) {
            const descriptor = descriptors?.[property];
            if (descriptor) Object.defineProperty(document, property, descriptor);
            else delete document[property];
        }
        delete window.__yomuSubtitleE2EVisibilityDescriptors;
        delete window.__yomuSubtitleE2EVisibilityHistory;
    });

    if (originalViewport) {
        await page.setViewportSize(originalViewport);
        await page.waitForTimeout(250);
        await captureSubtitleFontState(page, site, checkpoints, 'portrait restore', {
            expectedSurface: longPrimaryCueFirstSegment,
            expectUpwardOverflow: true,
        });
    }
    return checkpoints;
}

async function assertSubtitleMoveHandle(page, site) {
    await closePanelIfOpen(page);
    await page.waitForFunction(() => Boolean(document.querySelector('.jpdb-subtitle-primary')?.textContent?.trim()), null, { timeout: site.readyTimeout ?? 25000 });
    await revealSubtitleControls(page, site);
    await page.waitForFunction(() => {
        const handle = document.querySelector('.jpdb-subtitle-text > .jpdb-subtitle-drag-handle');
        if (!handle) return false;
        const style = getComputedStyle(handle);
        return style.pointerEvents !== 'none' && Number(style.opacity || '0') > 0.1;
    }, null, { timeout: 5000 });

    await installSubtitleDragProbe(page);
    const before = await subtitleDragSnapshot(page, site);
    const handleBox = await page.locator('.jpdb-subtitle-text > .jpdb-subtitle-drag-handle').first().boundingBox();
    assert(handleBox, `${site.name}: subtitle move handle did not expose a drag box`, before);
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 - 52, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await subtitleDragSnapshot(page, site);
    assert(after.subtitle && before.subtitle && after.subtitle.top < before.subtitle.top - 18, `${site.name}: subtitle line did not move with the drag handle`, { before, after });
    assert(after.bottomOffset > before.bottomOffset + 2, `${site.name}: subtitle drag handle did not sync to the bottom-offset setting`, { before, after, dragProbe: await subtitleDragProbeSnapshot(page) });

    await page.waitForTimeout(2700);
    const idle = await subtitleRailIdleSnapshot(page);
    assert(idle.idle && (idle.opacity <= 0.05 || idle.pointerEvents === 'none'), `${site.name}: subtitle rail did not return to idle after drag`, idle);
}

async function installSubtitleDragProbe(page) {
    await page.evaluate(() => {
        const handle = document.querySelector('.jpdb-subtitle-text > .jpdb-subtitle-drag-handle');
        const probe = {
            pointerdown: 0,
            pointermove: 0,
            pointerup: 0,
            mousedown: 0,
            mousemove: 0,
            mouseup: 0,
            lastTarget: '',
            lastWindowTarget: '',
        };
        globalThis.__yomuSubtitleDragProbe = probe;
        handle?.addEventListener('pointerdown', event => {
            probe.pointerdown += 1;
            probe.lastTarget = describeTarget(event.target);
        }, true);
        handle?.addEventListener('mousedown', event => {
            probe.mousedown += 1;
            probe.lastTarget = describeTarget(event.target);
        }, true);
        window.addEventListener('pointermove', event => {
            probe.pointermove += 1;
            probe.lastWindowTarget = describeTarget(event.target);
        }, true);
        window.addEventListener('pointerup', event => {
            probe.pointerup += 1;
            probe.lastWindowTarget = describeTarget(event.target);
        }, true);
        window.addEventListener('mousemove', event => {
            probe.mousemove += 1;
            probe.lastWindowTarget = describeTarget(event.target);
        }, true);
        window.addEventListener('mouseup', event => {
            probe.mouseup += 1;
            probe.lastWindowTarget = describeTarget(event.target);
        }, true);

        function describeTarget(target) {
            if (!(target instanceof Element)) return String(target);
            return `${target.tagName.toLowerCase()}#${target.id}.${String(target.className).replace(/\s+/g, '.')}`;
        }
    });
}

async function subtitleDragProbeSnapshot(page) {
    return page.evaluate(() => {
        const handle = document.querySelector('.jpdb-subtitle-text > .jpdb-subtitle-drag-handle');
        const rect = handle?.getBoundingClientRect();
        const centerX = rect ? rect.left + rect.width / 2 : 0;
        const centerY = rect ? rect.top + rect.height / 2 : 0;
        const topElement = document.elementFromPoint(centerX, centerY);
        const style = handle ? getComputedStyle(handle) : undefined;
        return {
            probe: globalThis.__yomuSubtitleDragProbe ?? null,
            handle: rect?.toJSON(),
            center: { x: centerX, y: centerY },
            topElement: topElement instanceof Element ? `${topElement.tagName.toLowerCase()}#${topElement.id}.${String(topElement.className).replace(/\s+/g, '.')}` : String(topElement),
            handleStyle: style ? {
                opacity: style.opacity,
                pointerEvents: style.pointerEvents,
                display: style.display,
                visibility: style.visibility,
                zIndex: style.zIndex,
            } : undefined,
        };
    });
}

async function closePanelIfOpen(page) {
    const isOpen = await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    });
    if (!isOpen) return;
    await closePanelFromRail(page);
}

async function revealSubtitleControls(page, site) {
    const anchor = await page.locator(site.anchorSelector || 'video').first().boundingBox();
    assert(anchor, `${site.name}: could not locate player frame for subtitle control reveal`, { anchorSelector: site.anchorSelector });
    await page.mouse.move(anchor.x + Math.min(anchor.width - 4, Math.max(4, anchor.width / 2)), anchor.y + Math.min(anchor.height - 4, Math.max(4, anchor.height / 2)));
}

async function subtitleDragSnapshot(page, site) {
    return page.evaluate(({ anchorSelector, settingsKey, defaultBottomOffset }) => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const subtitle = document.querySelector('.jpdb-subtitle-text');
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const anchor = anchorSelector ? document.querySelector(anchorSelector) : document.querySelector('video');
        const offset = Number.parseFloat(root?.style.getPropertyValue('--subtitle-drag-offset-y') || '0');
        const settings = readSettings();
        const bottomOffset = Number.isFinite(settings.subtitleBottomOffset)
            ? settings.subtitleBottomOffset
            : defaultBottomOffset;
        return {
            offset,
            bottomOffset,
            root: root?.getBoundingClientRect().toJSON(),
            subtitle: subtitle?.getBoundingClientRect().toJSON(),
            rail: rail?.getBoundingClientRect().toJSON(),
            anchor: anchor?.getBoundingClientRect().toJSON(),
        };
        function readSettings() {
            try {
                return JSON.parse(localStorage.getItem(settingsKey) || '{}') || {};
            } catch {
                return {};
            }
        }
    }, {
        anchorSelector: site.anchorSelector ?? '',
        settingsKey: settingsStorageKey,
        defaultBottomOffset: defaultSubtitleBottomOffset,
    });
}

async function subtitleRailIdleSnapshot(page) {
    return page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const style = rail ? getComputedStyle(rail) : null;
        return {
            idle: Boolean(root?.classList.contains('jpdb-subtitle-controls-idle')),
            opacity: Number(style?.opacity ?? '0'),
            pointerEvents: style?.pointerEvents ?? '',
        };
    });
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
    // Placement items live inside the collapsed panel-options popover; open it
    // the way a user would before clicking the target dock.
    await page.locator('.jpdb-subtitle-list [data-action="panel-options"]').first().click();
    await page.waitForFunction(() => {
        const menu = document.querySelector('.jpdb-subtitle-list .jpdb-subtitle-panel-options-menu');
        return menu instanceof HTMLElement && !menu.hidden;
    }, null, { timeout: 3000 });
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
            expectRows: false,
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
            expectRows: false,
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
    const playerEngineSites = [
        { name: 'bbc-article', path: '/bbc', anchorSelector: '.bbc-media-player', exerciseSubtitleDrag: true },
        { name: 'videojs-engine', path: '/videojs', anchorSelector: '.video-js', exerciseSubtitleDrag: true },
        { name: 'jwplayer-engine', path: '/jwplayer', anchorSelector: '.jwplayer', exerciseSubtitleDrag: true },
        { name: 'plyr-engine', path: '/plyr', anchorSelector: '.plyr', exerciseSubtitleDrag: true },
        { name: 'vimeo-embed', path: '/vimeo', anchorSelector: '.vimeo-player' },
        { name: 'wistia-embed', path: '/wistia', anchorSelector: '.wistia_embed' },
        { name: 'mux-kaltura-engine', path: '/mux', anchorSelector: '.mux-player' },
    ].map(site => ({
        ...site,
        url: `${fixture.origin}${site.path}`,
        viewport: { width: 1680, height: 960 },
        expectPlacement: 'right',
        expectNativeCaptions: true,
        settings: { subtitleTranscriptPlacement: 'right' },
    }));
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
            exerciseFontPersistence: true,
            settings: { subtitleTranscriptPlacement: 'right', subtitleFontSize: 60 },
            anchorSelector: '.player',
        },
        {
            name: 'generic-docking',
            url: `${fixture.origin}/generic`,
            viewport: { width: 1600, height: 950 },
            expectPlacement: 'right',
            expectNativeCaptions: true,
            exerciseDockingControls: true,
            exerciseSubtitleDrag: true,
            settings: { subtitleTranscriptPlacement: 'right' },
            anchorSelector: '.player',
        },
        ...playerEngineSites,
        ...transcriptPlacements.map(placement => siteWithPlacement({
            name: 'cij',
            url: 'https://cijapanese.com/video/560',
            viewport: { width: 2048, height: 1050 },
            route: installFixtureRoutes,
            expectNativeCaptions: true,
            exerciseSubtitleDrag: placement === 'right',
            anchorSelector: '.lesson-player',
        }, placement)),
        {
            name: 'youtube-mobile',
            url: 'https://m.youtube.com/watch?v=_fXQ8TquRWo&list=PLx5DSNMsjO9hJx2kV5JegcddNqQZtj34d&index=5&pp=iAQB&ra=m',
            viewport: { width: 980, height: 844 },
            route: installMobileYouTubeFixtureRoutes,
            expectRows: false,
            readyTimeout: 30000,
            anchorSelector: '#movie_player',
            expectClosedRailTappable: true,
            settings: { subtitleTranscriptPlacement: 'right' },
        },
    ];
    const results = [];
    for (const site of sites.filter(site => shouldRunSite(site.name))) results.push(await runSite(browser, site));
    if (shouldRunSite('youtube')) results.push(...await runYouTubeWithFallback(browser));
    assert(results.length > 0, 'No subtitle E2E sites matched YOMU_E2E_SITE_FILTER', { siteFilters });
    console.log(JSON.stringify({ artifactsDir, results }, null, 2));
} finally {
    await browser.close();
    await new Promise(resolve => fixture.server.close(resolve));
}
