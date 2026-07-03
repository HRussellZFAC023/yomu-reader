// Regression smoke: Yomu must not keep YouTube's player controls awake.
// Serves a mocked watch page whose player emulates YouTube's control
// auto-hide (hide 3s after the last wake; wake on window resize,
// player.setSize, video pause/play/seek) and simulates advancing playback.
// Fails if the controls are still awake at the end of a hands-off playback
// window, or if Yomu emits wake triggers while idle. Modes: lines drawer,
// shadow drawer, shadow+auto-pause.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { assert, launchSmokeBrowser } from './lib/smoke-harness.mjs';

const USERSCRIPT_PATH = resolve('dist/yomu.user.js');
const CSS_PATH = resolve('dist/yomu.css');
const COMPANION_DIR = resolve('docs/public/greasyfork');
const COMPANION_PATHS = ['yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => resolve(COMPANION_DIR, name));
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const WATCH_URL = 'https://www.youtube.com/watch?v=wake123';
const HEADED = process.env.HEADED === '1';

const baseSettings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: false,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleTranscriptVisible: true,
    subtitleControlsMode: 'auto',
};

const youtubeTimedText = `<timedtext><body>
<p t="0" d="1500"><s t="0">こんにちは、今日は良い天気です。</s></p>
<p t="2000" d="1500"><s t="0">日本語の字幕を確認します。</s></p>
<p t="4000" d="1500"><s t="0">三番目の字幕行です。</s></p>
<p t="6000" d="1500"><s t="0">四番目の字幕行です。</s></p>
<p t="8000" d="1500"><s t="0">五番目の字幕行です。</s></p>
</body></timedtext>`;

function playerResponse() {
    return {
        videoDetails: { videoId: 'wake123' },
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=wake123&lang=ja',
                    languageCode: 'ja',
                    vssId: '.ja',
                    name: { simpleText: 'Japanese' },
                }],
            },
        },
    };
}

function watchHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Controls Wake Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytd-watch-flexy { display: block; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr); padding: 60px 24px; }
    #movie_player { position: relative; width: 960px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse())};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="wake123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video muted></video>
          </div>
        </div></div></div>
      </section>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');

    // ---- simulated playback ----
    let playing = false;
    let mediaTime = 0;
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (playing) mediaTime = Math.min(10, mediaTime + (now - lastTick) / 1000);
      lastTick = now;
    }, 100);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => !playing });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value) => { mediaTime = value; window.__wake.seeks++; wakeControls('seek'); video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked')); },
    });
    video.play = () => { if (!playing) { playing = true; window.__wake.plays++; wakeControls('play'); video.dispatchEvent(new Event('play')); video.dispatchEvent(new Event('playing')); } return Promise.resolve(); };
    video.pause = () => { if (playing) { playing = false; window.__wake.pauses++; wakeControls('pause'); video.dispatchEvent(new Event('pause')); } };

    // ---- emulated YouTube control auto-hide ----
    window.__wake = { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0 };
    let hideTimer;
    function wakeControls(reason) {
      window.__wake.wakes.push({ reason, t: Math.round(performance.now()) });
      player.classList.remove('ytp-autohide');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (playing) player.classList.add('ytp-autohide'); }, 3000);
    }
    window.addEventListener('resize', (e) => {
      window.__wake.resizes++;
      if (!e.isTrusted) window.__wake.syntheticResizes++;
      wakeControls('resize');
    });

    player.getVideoData = () => ({ video_id: 'wake123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      window.__wake.setSizes++;
      wakeControls('setSize');
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };

    // sample controls visibility every 500ms while playing
    setInterval(() => {
      if (!playing) return;
      window.__wake.samples++;
      if (!player.classList.contains('ytp-autohide')) window.__wake.visibleSamples++;
    }, 500);
  </script>
</body>
</html>`;
}

function mobileWatchHtml() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Controls Wake Mobile Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytm-app { display: block; }
    ytm-player { display: block; position: relative; width: 100vw; aspect-ratio: 16 / 9; background: #000; }
    #movie_player { position: absolute; inset: 0; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    #player-control-overlay { position: absolute; inset: 0; opacity: 0; transition: opacity .15s; pointer-events: none; }
    #player-control-overlay.fadein { opacity: 1; pointer-events: auto; }
    main { min-height: 1600px; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse())};
  </script>
</head>
<body>
  <ytm-app>
    <main>
      <ytm-player>
        <div id="movie_player">
          <video muted playsinline></video>
          <div id="player-control-overlay" class="fadein"><button aria-label="Play">play</button></div>
        </div>
      </ytm-player>
      <ytm-slim-video-metadata-renderer><h2>モバイル字幕テスト</h2></ytm-slim-video-metadata-renderer>
    </main>
  </ytm-app>
  <script>
    const player = document.querySelector('#movie_player');
    const overlay = document.querySelector('#player-control-overlay');
    const video = document.querySelector('video');

    let playing = false;
    let mediaTime = 0;
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (playing) mediaTime = Math.min(10, mediaTime + (now - lastTick) / 1000);
      lastTick = now;
    }, 100);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => !playing });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value) => { mediaTime = value; window.__wake.seeks++; wakeControls('seek'); video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked')); },
    });
    video.play = () => { if (!playing) { playing = true; window.__wake.plays++; wakeControls('play'); video.dispatchEvent(new Event('play')); video.dispatchEvent(new Event('playing')); } return Promise.resolve(); };
    video.pause = () => { if (playing) { playing = false; window.__wake.pauses++; wakeControls('pause'); video.dispatchEvent(new Event('pause')); } };

    window.__wake = { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0 };
    let hideTimer;
    function wakeControls(reason) {
      window.__wake.wakes.push({ reason, t: Math.round(performance.now()) });
      overlay.classList.add('fadein');
      clearTimeout(hideTimer);
      // m.youtube.com keeps controls while paused; only fades while playing
      hideTimer = setTimeout(() => { if (playing) overlay.classList.remove('fadein'); }, 3000);
    }
    window.addEventListener('resize', (e) => {
      window.__wake.resizes++;
      if (!e.isTrusted) window.__wake.syntheticResizes++;
      wakeControls('resize');
    });

    player.getVideoData = () => ({ video_id: 'wake123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { window.__wake.setSizes++; wakeControls('setSize'); };
    player.pauseVideo = () => { video.pause(); };
    player.playVideo = () => { video.play(); };

    setInterval(() => {
      if (!playing) return;
      window.__wake.samples++;
      if (overlay.classList.contains('fadein')) window.__wake.visibleSamples++;
    }, 500);
    // initial state: user just tapped play
    setTimeout(() => wakeControls('initial'), 0);
  </script>
</body>
</html>`;
}

async function runMode(browser, { name, settings, prepare, viewport, screenshot, mobile }) {
    const ctx = await browser.newContext({
        viewport: viewport ?? { width: 1180, height: 820 },
        hasTouch: true,
        isMobile: (viewport?.width ?? 1180) < 900,
        bypassCSP: true,
    });
    await ctx.route('https://www.youtube.com/watch*', route => route.fulfill({ contentType: 'text/html', body: watchHtml() }));
    await ctx.route('https://m.youtube.com/watch*', route => route.fulfill({ contentType: 'text/html', body: mobileWatchHtml() }));
    await ctx.route(/https:\/\/m\.youtube\.com\/api\/timedtext.*/, route => route.fulfill({ contentType: 'text/xml', body: youtubeTimedText }));
    await ctx.route('https://www.youtube.com/api/timedtext*', route => route.fulfill({ contentType: 'text/xml', body: youtubeTimedText }));
    await ctx.route(/https:\/\/m\.youtube\.com\/(?!watch|api\/timedtext).*/, route => route.fulfill({ status: 204, body: '' }));
    await ctx.route(/https:\/\/(www\.)?(youtube\.com|google\.com|gstatic\.com|ytimg\.com)\/(?!watch|api\/timedtext).*/, route => route.fulfill({ status: 204, body: '' }));

    await ctx.addInitScript({ content: `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ [SETTINGS_KEY]: settings })}));
  const listeners = new Map();
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = (k) => store.delete(k);
  window.GM_listValues = () => Array.from(store.keys());
  window.GM_addValueChangeListener = (k, f) => { const a=listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  window.GM_getResourceText = (name) => name === 'yomuCss' ? ${JSON.stringify(readFileSync(CSS_PATH, 'utf8'))} : '';
  window.GM_info = { script: { version: '0.0.0-smoke', name: 'yomu' }, scriptHandler: 'SmokeGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: ()=>{},
    xmlHttpRequest: (o)=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = (o) => {
    fetch(o.url, { method: o.method || 'GET', headers: o.headers, body: o.data })
      .then(async r => { const text = await r.text(); if (o.onload) o.onload({ status: r.status, statusText: '', responseText: text, response: text, responseHeaders: '', finalUrl: o.url }); })
      .catch(e => { if (o.onerror) o.onerror({ status: 0, error: String(e) }); });
    return { abort(){} };
  };
})();
` });
    for (const companionPath of COMPANION_PATHS) await ctx.addInitScript({ path: companionPath });
    await ctx.addInitScript({ path: USERSCRIPT_PATH });

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
    await page.goto(mobile ? 'https://m.youtube.com/watch?v=wake123' : WATCH_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    if (prepare) await prepare(page);

    // Start playback with one wake (as a user tap would), then hands off.
    await page.evaluate(() => document.querySelector('video').play());
    await page.waitForTimeout(1000);
    // reset counters after startup churn so we only measure steady-state
    await page.evaluate(() => {
        Object.assign(window.__wake, { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0 });
    });
    await page.waitForTimeout(8000);

    if (screenshot) await page.screenshot({ path: screenshot }).catch(() => {});
    const wake = await page.evaluate(() => ({ ...window.__wake, wakes: window.__wake.wakes.slice(-20) }));
    const yomuState = await page.evaluate(() => ({
        drawer: Boolean(document.querySelector('.jpdb-subtitle-list:not([hidden])')),
        overlay: Boolean(document.querySelector('.jpdb-subtitle-lines')),
        rail: Boolean(document.querySelector('.jpdb-subtitle-rail')),
        cueText: document.querySelector('.jpdb-subtitle-lines')?.textContent?.slice(0, 20) ?? '',
        panelModePressed: document.querySelector('.jpdb-subtitle-panel-mode button[aria-pressed="true"]')?.textContent ?? '',
    }));
    const controlsHidden = await page.evaluate(() => {
        const overlay = document.querySelector('#player-control-overlay');
        if (overlay) return !overlay.classList.contains('fadein');
        return document.querySelector('#movie_player').classList.contains('ytp-autohide');
    });
    const playing = await page.evaluate(() => !document.querySelector('video').paused);
    await ctx.close();
    return { name, wake, controlsHidden, playing, pageErrors, yomuState };
}

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: !HEADED });

const results = [];
results.push(await runMode(browser, { name: 'lines-drawer', settings: baseSettings }));
results.push(await runMode(browser, { name: 'lines-drawer-ipad', settings: baseSettings, viewport: { width: 810, height: 1080 } }));
results.push(await runMode(browser, { name: 'lines-drawer-phone', settings: baseSettings, viewport: { width: 390, height: 844 } }));
results.push(await runMode(browser, {
    name: 'shadow-drawer-phone',
    settings: baseSettings,
    viewport: { width: 390, height: 844 },
    screenshot: process.env.SHADOW_SHOT || undefined,
    prepare: async page => {
        await page.evaluate(() => document.querySelector('[data-action="panel-shadow"]')?.click());
        await page.waitForTimeout(800);
    },
}));
results.push(await runMode(browser, {
    name: 'shadow-drawer-ipad',
    settings: baseSettings,
    viewport: { width: 810, height: 1080 },
    prepare: async page => {
        await page.evaluate(() => document.querySelector('[data-action="panel-shadow"]')?.click());
        await page.waitForTimeout(800);
    },
}));
results.push(await runMode(browser, {
    name: 'shadow-drawer',
    settings: baseSettings,
    prepare: async page => {
        await page.evaluate(() => document.querySelector('[data-action="panel-shadow"]')?.click());
        await page.waitForTimeout(800);
    },
}));

results.push(await runMode(browser, {
    name: 'mobile-lines',
    settings: baseSettings,
    viewport: { width: 390, height: 844 },
    mobile: true,
}));
results.push(await runMode(browser, {
    name: 'mobile-shadow',
    settings: baseSettings,
    viewport: { width: 390, height: 844 },
    mobile: true,
    screenshot: process.env.MOBILE_SHADOW_SHOT || undefined,
    prepare: async page => {
        await page.evaluate(() => document.querySelector('[data-action="panel-shadow"]')?.click());
        await page.waitForTimeout(800);
    },
}));

await browser.close();

let failed = false;
for (const result of results) {
    const { wake } = result;
    const summary = {
        mode: result.name,
        yomu: result.yomuState,
        playing: result.playing,
        controlsHiddenAtEnd: result.controlsHidden,
        steadyStateWakes: wake.wakes.length,
        syntheticResizes: wake.syntheticResizes,
        setSizes: wake.setSizes,
        pauses: wake.pauses,
        seeks: wake.seeks,
        visibleFraction: wake.samples ? +(wake.visibleSamples / wake.samples).toFixed(2) : 0,
        lastWakes: wake.wakes.slice(-6),
        pageErrors: result.pageErrors.slice(0, 3),
    };
    console.log(JSON.stringify(summary));
    try {
        assert(result.playing, `${result.name}: video still playing at end`);
        assert(result.yomuState.overlay && result.yomuState.drawer, `${result.name}: yomu subtitle overlay + drawer mounted`);
        assert(wake.syntheticResizes === 0, `${result.name}: no synthetic window resizes during steady-state playback (got ${wake.syntheticResizes})`);
        assert(wake.setSizes === 0, `${result.name}: no player.setSize calls during steady-state playback (got ${wake.setSizes})`);
        assert(result.controlsHidden, `${result.name}: native controls auto-hid during hands-off playback`);
    } catch (error) {
        failed = true;
        console.error(String(error.message ?? error));
    }
}

if (failed) { console.error('FAIL youtube-controls-wake-smoke'); process.exit(1); }
console.log('PASS youtube-controls-wake-smoke');
