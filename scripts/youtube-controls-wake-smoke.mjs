// Regression smoke: Yomu must not keep YouTube's player controls awake.
// Serves a mocked watch page whose player emulates YouTube's control
// auto-hide (hide 3s after the last wake; wake on window resize,
// player.setSize, video pause/play/seek) and simulates advancing playback.
// Fails if the controls are still awake at the end of a hands-off playback
// window, or if Yomu emits wake triggers while idle. Modes: lines drawer,
// shadow drawer, shadow+auto-pause.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { assert, launchSmokeBrowser } from './lib/smoke-harness.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from './fixtures/youtube-fixtures.mjs';

const USERSCRIPT_PATH = resolve('dist/yomu.user.js');
const CSS_PATH = resolve('dist/yomu.css');
const COMPANION_DIR = resolve('docs/public/greasyfork');
const COMPANION_PATHS = ['yomu-kanji-study.user.js', 'yomu-settings-surface.user.js', 'yomu-video.user.js']
    .map(name => resolve(COMPANION_DIR, name));
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const WATCH_URL = 'https://www.youtube.com/watch?v=wake123';
const HEADED = process.env.HEADED === '1';
const ENGINE_NAME = process.env.YOMU_YOUTUBE_CONTROLS_WAKE_ENGINE?.trim()
    || process.env.YOMU_E2E_BROWSER?.trim()
    || 'chromium';
const ENGINE = ENGINE_NAME === 'webkit' ? webkit : chromium;
const FOCUS_ONLY = process.env.YOMU_YOUTUBE_CONTROLS_WAKE_FOCUS_ONLY === '1';
if (!['chromium', 'webkit'].includes(ENGINE_NAME)) {
    throw new Error(`Unknown YOMU_YOUTUBE_CONTROLS_WAKE_ENGINE: ${ENGINE_NAME}`);
}

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

const youtubeTimedTextFixture = youtubeTimedText([
    { start: 0, duration: 1500, text: 'こんにちは、今日は良い天気です。' },
    { start: 2000, duration: 1500, text: '日本語の字幕を確認します。' },
    { start: 4000, duration: 1500, text: '三番目の字幕行です。' },
    { start: 6000, duration: 1500, text: '四番目の字幕行です。' },
    { start: 8000, duration: 1500, text: '五番目の字幕行です。' },
]);

async function runMode(browser, { name, settings, prepare, viewport, screenshot, mobile, inlineFullscreen, nudgeViewport, focusRail }) {
    const ctx = await browser.newContext({
        viewport: viewport ?? { width: 1180, height: 820 },
        hasTouch: true,
        isMobile: (viewport?.width ?? 1180) < 900,
        bypassCSP: true,
    });
    await ctx.route('https://www.youtube.com/watch*', route => route.fulfill({
        contentType: 'text/html',
        body: youtubeWatchHtml({
            fixture: 'controls-wake',
            mobile: false,
            playerResponse: youtubePlayerResponse('wake123'),
        }),
    }));
    await ctx.route('https://m.youtube.com/watch*', route => route.fulfill({
        contentType: 'text/html',
        body: youtubeWatchHtml({
            fixture: 'controls-wake',
            mobile: true,
            playerResponse: youtubePlayerResponse('wake123'),
        }),
    }));
    await ctx.route(/https:\/\/m\.youtube\.com\/api\/timedtext.*/, route => route.fulfill({ contentType: 'text/xml', body: youtubeTimedTextFixture }));
    await ctx.route('https://www.youtube.com/api/timedtext*', route => route.fulfill({ contentType: 'text/xml', body: youtubeTimedTextFixture }));
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
    if (inlineFullscreen) {
        // Simulate iPad in-browser YouTube refusing the element Fullscreen API:
        // requestFullscreen rejects, so Yomu's fullscreen-redirect falls back to
        // its inline CSS-fullscreen (enterInlineFullscreen) — the exact state the
        // user is in. This init script runs before the userscript, so the redirect
        // captures this rejecting native and its inline fallback fires.
        await ctx.addInitScript({ content: `
(() => {
  const reject = function requestFullscreen() { return Promise.reject(new Error('smoke: element fullscreen unavailable')); };
  try { HTMLElement.prototype.requestFullscreen = reject; } catch {}
  try { delete HTMLVideoElement.prototype.webkitEnterFullscreen; } catch {}
})();
` });
    }
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
    // reset counters after startup churn so we only measure steady-state. For the
    // inline-fullscreen modes the fullscreen ENTER + viewport nudge happen AFTER
    // this reset, so any synthetic resize Yomu emits while going/being fullscreen
    // is counted (that is exactly the regression under test).
    await page.evaluate(() => {
        Object.assign(window.__wake, { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0, focusBlocks: 0 });
    });

    if (inlineFullscreen) {
        // Drive Yomu's OWN inline CSS-fullscreen path the way iPad does: request
        // fullscreen on the video. The fullscreen-redirect patch reroutes it to the
        // #movie_player container; when the element Fullscreen API is unavailable or
        // refused (iPad in-browser YouTube, and headless Chromium without a user
        // gesture) it falls back to enterInlineFullscreen, which adds
        // html.jpdb-subtitle-inline-fullscreen and fires Yomu's fullscreen-like
        // events. This exercises the real code that (pre-fix) emitted a synthetic
        // global resize on every inline-fullscreen enter/exit and woke the controls.
        await page.evaluate(() => {
            const video = document.querySelector('video');
            try { video?.requestFullscreen?.(); } catch { /* headless rejects → inline fallback */ }
        });
        await page.waitForTimeout(500);
        // Guarantee the inline-fullscreen state even if the environment took the
        // native path, so the steady-state assertion always runs in fullscreen.
        await page.evaluate(() => {
            if (document.documentElement.classList.contains('jpdb-subtitle-inline-fullscreen')) return;
            const player = document.querySelector('#movie_player');
            player?.classList.add('ytp-fullscreen', 'fullscreen');
            player?.setAttribute('data-yomu-inline-fullscreen', 'true');
            document.documentElement.classList.add('jpdb-subtitle-inline-fullscreen');
            document.dispatchEvent(new Event('fullscreenchange'));
            document.dispatchEvent(new Event('webkitfullscreenchange'));
        });
        await page.waitForTimeout(800);
    }

    if (nudgeViewport) {
        // iPad CSS-fullscreen + touch jitters the visual viewport (URL bar hide,
        // orientation micro-shifts). Each trusted resize re-runs Yomu's layout;
        // pre-fix this (plus the fullscreen-enter path) re-emitted a SYNTHETIC
        // global resize — waking YouTube's controls in an endless loop. These
        // trusted nudges must NOT provoke any synthetic resize from Yomu.
        const base = page.viewportSize() ?? { width: 1180, height: 820 };
        for (const width of [base.width - 60, base.width - 20, base.width]) {
            await page.setViewportSize({ width: Math.max(480, width), height: base.height });
            await page.waitForTimeout(500);
        }
    }

    let focusedRailBeforeIdle = false;
    if (focusRail) {
        const railControl = page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]');
        // Drive a trusted touch gesture. Automated WebKit does not retain
        // button focus as reported iPad Safari did, so a target click hook
        // models only the post-click sticky focus tail, after Yomu's normal
        // click blur; every pointer/drag/click event remains browser-generated.
        await railControl.evaluate(control => {
            control.addEventListener('click', () => {
                window.setTimeout(() => control.focus(), 0);
            }, { once: true });
        });
        await railControl.tap({ force: true });
        await page.waitForTimeout(50);
        focusedRailBeforeIdle = await railControl.evaluate(control => document.activeElement === control);
        const railDragging = await railControl.evaluate(control => (
            control.closest('.jpdb-subtitle-rail')?.classList.contains('jpdb-subtitle-rail-dragging') ?? false
        ));
        assert(!railDragging, 'ipad-focused-rail: pointer gesture left rail drag active');
    }

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
    const railFocusedAtEnd = await page.evaluate(() => Boolean(
        document.activeElement?.closest?.('.jpdb-subtitle-player .jpdb-subtitle-rail'),
    ));
    const railInsidePlayer = await page.evaluate(() => {
        const player = document.querySelector('#movie_player');
        const rail = document.querySelector('.jpdb-subtitle-player .jpdb-subtitle-rail');
        return Boolean(player && rail && player.contains(rail));
    });
    // Reproduce the report's Cmd+A / copy boundary with real browser
    // selection. Keep both reported strings visibly present in Yomu-owned UI
    // while ordinary page text is selected normally.
    await page.locator('#selection-proof').click({ force: true });
    const selectionUiReady = await page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const status = document.createElement('div');
        status.className = 'jpdb-subtitle-status';
        status.dataset.selectionProof = 'status';
        status.append(document.createTextNode('No subtitle tracks detected yet.'));
        root?.append(status);
        document.querySelector('[data-action="style"]')?.click();
        const transcript = document.querySelector('.jpdb-subtitle-list');
        if (transcript) {
            transcript.hidden = false;
            transcript.textContent = 'Transcript panel UI must not enter page copy.';
        }
        document.getSelection()?.removeAllRanges();
        return {
            styleOpen: !document.querySelector('[data-subtitle-style-popover]')?.hasAttribute('hidden'),
            hasStatus: status.textContent?.includes('No subtitle tracks detected yet.') ?? false,
            hasReset: document.body.textContent?.includes('Reset defaults') ?? false,
        };
    });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    const selectedText = await page.evaluate(() => document.getSelection()?.toString() ?? '');
    const selectionProof = {
        ...selectionUiReady,
        ordinaryPageTextSelected: selectedText.includes('Ordinary YouTube page text remains selectable.'),
        subtitleStatusSelected: selectedText.includes('No subtitle tracks detected yet.'),
        subtitleSettingsSelected: selectedText.includes('Reset defaults'),
        transcriptUiSelected: selectedText.includes('Transcript panel UI must not enter page copy.'),
    };
    await ctx.close();
    return {
        name,
        wake,
        controlsHidden,
        playing,
        pageErrors,
        yomuState,
        nudgeViewport: Boolean(nudgeViewport),
        focusRail: Boolean(focusRail),
        focusedRailBeforeIdle,
        railFocusedAtEnd,
        railInsidePlayer,
        selectionProof,
    };
}

const browser = await launchSmokeBrowser(ENGINE, ENGINE_NAME, { headless: !HEADED });

const results = [];
if (!FOCUS_ONLY) {
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

// iPad in-browser YouTube with the side drawer open and the viewport jittering
// (URL-bar/orientation churn). This exercises the named inset-relayout path
// (dispatchSubtitleVideoLayoutResize): pre-fix each nudge re-applied the docked
// inset and re-emitted a SYNTHETIC global resize, resetting YouTube's controls
// idle timer. RED→GREEN target for Regression 1.
results.push(await runMode(browser, {
    name: 'ipad-drawer-nudge',
    settings: baseSettings,
    viewport: { width: 1024, height: 768 },
    nudgeViewport: true,
}));

// iPad in-browser YouTube, Yomu inline CSS-fullscreen + a viewport nudge.
// Fills the iPad fullscreen blind spot: asserts Yomu emits zero synthetic
// global resizes (so the native controls-idle timer is never reset by Yomu).
results.push(await runMode(browser, {
    name: 'ipad-inline-fullscreen',
    settings: baseSettings,
    viewport: { width: 1024, height: 768 },
    inlineFullscreen: true,
    nudgeViewport: true,
}));
results.push(await runMode(browser, {
    name: 'ipad-inline-fullscreen-shadow',
    settings: baseSettings,
    viewport: { width: 1024, height: 768 },
    inlineFullscreen: true,
    nudgeViewport: true,
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
}

// Reproduce iPad Safari's sticky-focus path in YouTube's CSS fullscreen. The
// fixture blocks native auto-hide only when focus is INSIDE the player subtree,
// matching YouTube's real contract. Yomu's rail is geometry-aligned to that
// player but must remain body-owned because CSS fullscreen is not a top layer.
results.push(await runMode(browser, {
    name: 'ipad-focused-rail',
    settings: baseSettings,
    viewport: { width: 1024, height: 768 },
    inlineFullscreen: true,
    focusRail: true,
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
        focusBlocks: wake.focusBlocks,
        focusedRailBeforeIdle: result.focusedRailBeforeIdle,
        railFocusedAtEnd: result.railFocusedAtEnd,
        railInsidePlayer: result.railInsidePlayer,
        selectionProof: result.selectionProof,
        lastWakes: wake.wakes.slice(-6),
        pageErrors: result.pageErrors.slice(0, 3),
    };
    console.log(JSON.stringify(summary));
    try {
        assert(result.playing, `${result.name}: video still playing at end`);
        assert(result.yomuState.overlay && result.yomuState.drawer, `${result.name}: yomu subtitle overlay + drawer mounted`);
        // The core regression: Yomu must never dispatch a SYNTHETIC global resize
        // on YouTube. YouTube treats it as user activity and resets the controls
        // idle-hide timer, which on iPad fullscreen kept the chrome permanently
        // awake. This holds even in the nudge modes: a real viewport change must be
        // answered with player.setSize(), never a re-broadcast window 'resize'.
        assert(wake.syntheticResizes === 0, `${result.name}: no synthetic window resizes during steady-state playback (got ${wake.syntheticResizes})`);
        // player.setSize is the legitimate refit call. It is expected when we
        // deliberately jitter the viewport (nudge modes); it must not fire on its
        // own during a genuinely idle window (all other modes).
        if (!result.nudgeViewport) {
            assert(wake.setSizes === 0, `${result.name}: no player.setSize calls during steady-state playback (got ${wake.setSizes})`);
        }
        if (result.focusRail) {
            assert(result.focusedRailBeforeIdle, `${result.name}: rail control did not receive the modelled sticky focus`);
            assert(!result.railInsidePlayer, `${result.name}: CSS fullscreen reparented Yomu focus into the player subtree`);
            assert(wake.focusBlocks === 0, `${result.name}: native auto-hide was blocked by Yomu focus (${wake.focusBlocks})`);
            assert(result.railFocusedAtEnd, `${result.name}: valid rail focus was discarded`);
        }
        assert(result.controlsHidden, `${result.name}: native controls auto-hid during hands-off playback`);
        assert(result.selectionProof.styleOpen, `${result.name}: subtitle style UI was not visible for selection proof`);
        assert(result.selectionProof.hasStatus && result.selectionProof.hasReset, `${result.name}: reported subtitle UI strings were absent`);
        assert(result.selectionProof.ordinaryPageTextSelected, `${result.name}: Select All no longer included ordinary page text`);
        assert(!result.selectionProof.subtitleStatusSelected, `${result.name}: Select All included subtitle status UI`);
        assert(!result.selectionProof.subtitleSettingsSelected, `${result.name}: Select All included subtitle settings UI`);
        assert(!result.selectionProof.transcriptUiSelected, `${result.name}: Select All included transcript UI`);
    } catch (error) {
        failed = true;
        console.error(String(error.message ?? error));
    }
}

if (failed) { console.error('FAIL youtube-controls-wake-smoke'); process.exit(1); }
console.log('PASS youtube-controls-wake-smoke');
