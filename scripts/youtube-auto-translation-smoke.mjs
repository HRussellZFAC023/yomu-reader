import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { addGmStorageBridgeInitScript, assert } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const USERSCRIPT_PATH = resolve(process.env.YOMU_YOUTUBE_AUTO_TRANSLATION_USERSCRIPT ?? 'dist/yomu.user.js');
const CSS_PATH = resolve(process.env.YOMU_YOUTUBE_AUTO_TRANSLATION_CSS ?? 'dist/yomu.css');
const DEFAULT_COMPANION_DIR = existsSync(resolve('dist/greasyfork')) ? 'dist/greasyfork' : 'docs/public/greasyfork';
const COMPANION_PATHS = ['yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => resolve(process.env.YOMU_YOUTUBE_AUTO_TRANSLATION_COMPANION_DIR ?? DEFAULT_COMPANION_DIR, name));
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const REQUEST_BRIDGE_NAME = '__yomuYoutubeAutoTranslationRequest';
const TRANSLATED_TEXT = '今日は本を読む。';
const SOURCE_TEXT = 'Today I read.';
const CASES = [
    { videoId: 'autotrans-source', sourceTimedtext: true },
    { videoId: 'autotrans-native', sourceTimedtext: false },
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    audioEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: true,
    subtitleTranscriptAutoScroll: false,
    subtitleControlsMode: 'always',
};

function youtubeWatchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

function youtubePlayerResponse(videoId) {
    return {
        videoDetails: { videoId },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
                    languageCode: 'en',
                    vssId: 'a.en',
                    kind: 'asr',
                    name: { simpleText: 'English (auto-generated)' },
                }],
                translationLanguages: [{
                    languageCode: 'ja',
                    languageName: { simpleText: '日本語' },
                }],
            },
        },
    };
}

function youtubeWatchHtml(videoId) {
    const response = youtubePlayerResponse(videoId);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Auto Translation Fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 22px; padding: 72px 24px; box-sizing: border-box; }
    #movie_player { position: relative; min-height: 440px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; min-height: 48px; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    aside { color: #aaa; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(response)};
    window.ytcfg = {
      get: key => ({
        HL: 'ja',
        INNERTUBE_CLIENT_NAME: 'WEB',
        INNERTUBE_CLIENT_VERSION: 'test-version',
      })[key] || '',
    };
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="${videoId}">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted playsinline></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment"></span></div>
          </div>
        </div></div></div>
      </section>
      <aside>Auto-translated subtitle fixture</aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    window.__captionSetOptions = [];
    let currentTime = 1.2;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = Number(value) || 0; },
    });
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    player.getVideoData = () => ({ video_id: '${videoId}' });
    player.getAudioTrack = () => ({ captionTracks: tracks });
    player.getOption = (_module, option) => option === 'tracklist' ? { captionTracks: tracks } : undefined;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setOption = (module, option, value) => {
      window.__captionSetOptions.push({ module, option, value });
      if (module === 'captions' && option === 'track' && value && value.translationLanguage) {
        document.querySelector('.ytp-caption-segment').textContent = '${TRANSLATED_TEXT}';
      }
    };
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('durationchange'));
    video.dispatchEvent(new Event('timeupdate'));
  </script>
</body>
</html>`;
}

function sourceTimedtextXml() {
    return `<transcript><text start="1" dur="4">${SOURCE_TEXT}</text></transcript>`;
}

function translatedJson() {
    return JSON.stringify({ sentences: [{ trans: TRANSLATED_TEXT }] });
}

function responseForUrl(url, options) {
    const parsed = new URL(url);
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname === '/watch') {
        return { status: 200, contentType: 'text/html', responseText: youtubeWatchHtml(parsed.searchParams.get('v') ?? '') };
    }
    if (parsed.hostname === 'www.youtube.com' && parsed.pathname.includes('/api/timedtext')) {
        if (parsed.searchParams.get('tlang') === 'ja') return { status: 200, contentType: 'text/xml', responseText: '' };
        return {
            status: 200,
            contentType: 'text/xml',
            responseText: options.sourceTimedtext ? sourceTimedtextXml() : '',
        };
    }
    if (parsed.hostname === 'translate.googleapis.com') {
        return { status: 200, contentType: 'application/json', responseText: translatedJson() };
    }
    return { status: 204, contentType: 'text/plain', responseText: '' };
}

async function installRoutes(page, options, requests) {
    await page.route('**/*', route => {
        const url = route.request().url();
        requests.push(url);
        const result = responseForUrl(url, options);
        return route.fulfill({
            status: result.status,
            contentType: result.contentType,
            body: result.responseText,
            headers: { 'access-control-allow-origin': '*' },
        });
    });
}

async function installUserscript(page) {
    await installUserscriptCssResource(page, CSS_PATH);
    for (const companionPath of COMPANION_PATHS) {
        await addScriptTagWithCspFallback(page, companionPath);
    }
    await addScriptTagWithCspFallback(page, USERSCRIPT_PATH);
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 10000 });
}

async function ensureLinesPanelOpen(page) {
    await page.waitForSelector('.jpdb-subtitle-rail [data-action="panel"]', { timeout: 10000 });
    await page.evaluate(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        if (!panel || panel.hidden) {
            document.querySelector('.jpdb-subtitle-rail [data-action="panel"]')?.click();
        }
    });
    await page.waitForFunction(() => {
        const panel = document.querySelector('.jpdb-subtitle-list');
        return Boolean(panel && !panel.hidden);
    }, null, { timeout: 10000 });
    await page.locator('.jpdb-subtitle-panel-mode [data-action="panel-lines"]').click({ force: true }).catch(() => undefined);
}

async function readSubtitleState(page) {
    return page.evaluate(() => ({
        rows: [...document.querySelectorAll('.jpdb-subtitle-list-row')].map(row => row.textContent?.trim() ?? ''),
        emptyText: document.querySelector('.jpdb-subtitle-list-empty')?.textContent?.trim() ?? '',
        metaText: document.querySelector('.jpdb-subtitle-drawer-meta')?.textContent?.trim() ?? '',
        selectedTrackText: document.querySelector('.jpdb-subtitle-track-selected')?.textContent?.trim() ?? '',
        captionOptions: window.__captionSetOptions ?? [],
    }));
}

async function runCase(browser, options) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const requests = [];
    page.on('console', message => {
        if (['error', 'warning'].includes(message.type())) console.log(`[browser:${message.type()}] ${message.text()}`);
    });
    await page.exposeFunction(REQUEST_BRIDGE_NAME, async request => {
        requests.push(request.url);
        return responseForUrl(request.url, options);
    });
    await addGmStorageBridgeInitScript(page, {
        key: SETTINGS_KEY,
        value: settings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await installRoutes(page, options, requests);
    await page.goto(youtubeWatchUrl(options.videoId), { waitUntil: 'domcontentloaded' });
    await installUserscript(page);
    await page.evaluate(() => {
        const video = document.querySelector('video');
        video.currentTime = 1.2;
        video.dispatchEvent(new Event('timeupdate'));
    });
    await ensureLinesPanelOpen(page);
    await page.waitForFunction(text => {
        return [...document.querySelectorAll('.jpdb-subtitle-list-row')]
            .some(row => row.textContent?.includes(text));
    }, TRANSLATED_TEXT, { timeout: 20000 });
    const state = await readSubtitleState(page);
    assert(state.rows.some(row => row.includes(TRANSLATED_TEXT)), `Expected translated Japanese row for ${options.videoId}`, state);
    assert(!state.emptyText.includes('Loading subtitle lines'), `Subtitle panel stayed in loading state for ${options.videoId}`, state);
    assert(!state.metaText.includes('0 lines'), `Subtitle metadata stayed at 0 lines for ${options.videoId}`, state);
    assert(requests.some(url => new URL(url).searchParams.get('tlang') === 'ja'), `Expected translated timedtext request for ${options.videoId}`, { requests });
    if (options.sourceTimedtext) {
        assert(requests.some(url => new URL(url).hostname === 'translate.googleapis.com'), 'Expected source timedtext translation request', { requests });
    } else {
        assert(state.captionOptions.some(entry => entry.option === 'track' && entry.value?.translationLanguage?.languageCode === 'ja'), 'Expected native YouTube caption activation with translationLanguage', state);
    }
    await page.close();
}

async function main() {
    const browser = await chromium.launch({ headless: process.env.YOMU_YOUTUBE_AUTO_TRANSLATION_HEADED !== '1' });
    try {
        for (const options of CASES) await runCase(browser, options);
    } finally {
        await browser.close();
    }
    console.log('YouTube auto-translated subtitle smoke passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
