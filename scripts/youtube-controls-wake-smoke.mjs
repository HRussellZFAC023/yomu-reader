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
import { addUserscriptGraphInitScripts } from './lib/smoke-test-helpers.mjs';
import { youtubePlayerResponse, youtubeTimedText, youtubeWatchHtml } from './fixtures/youtube-fixtures.mjs';

const USERSCRIPT_PATH = resolve('dist/yomu.user.js');
const CSS_PATH = resolve('dist/yomu.css');
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

function controlsWakePrelude(settings, inlineFullscreen) {
    const programs = [`
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
`];
    if (inlineFullscreen) programs.push(`
(() => {
  const reject = function requestFullscreen() { return Promise.reject(new Error('smoke: element fullscreen unavailable')); };
  try { HTMLElement.prototype.requestFullscreen = reject; } catch {}
  try { delete HTMLVideoElement.prototype.webkitEnterFullscreen; } catch {}
})();
`);
    return programs.join('\n;\n');
}

async function enterInlineFullscreen(page, enabled) {
    if (!enabled) return;
    // Drive Yomu's own inline CSS-fullscreen fallback: this is the iPad path
    // where element fullscreen is unavailable, not a fixture-only DOM state.
    await page.evaluate(() => {
        const video = document.querySelector('video');
        try {
            void Promise.resolve(video?.requestFullscreen?.()).catch(() => {});
        } catch { /* headless rejects, so Yomu takes the inline fallback */ }
    });
    await page.waitForTimeout(500);
    // Keep the steady-state assertion in fullscreen if this browser happened
    // to accept the native request despite the rejecting prelude.
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

async function nudgeVisualViewport(page, enabled) {
    if (!enabled) return;
    // Model iPad URL-bar/orientation viewport churn. Trusted viewport changes
    // may refit the player, but Yomu must not rebroadcast synthetic resizes.
    const base = page.viewportSize() ?? { width: 1180, height: 820 };
    for (const width of [base.width - 60, base.width - 20, base.width]) {
        await page.setViewportSize({ width: Math.max(480, width), height: base.height });
        await page.waitForTimeout(500);
    }
}

async function focusSubtitleRail(page, enabled) {
    if (!enabled) return false;
    const railControl = page.locator('.jpdb-subtitle-rail [data-action="rail-expand"]');
    // Automated WebKit does not retain the focus seen on iPad Safari, so the
    // click hook models only that post-click sticky-focus tail.
    await railControl.evaluate(control => {
        control.addEventListener('click', () => {
            window.setTimeout(() => control.focus(), 0);
        }, { once: true });
    });
    await railControl.tap({ force: true });
    await page.waitForTimeout(50);
    const focused = await railControl.evaluate(control => document.activeElement === control);
    const dragging = await railControl.evaluate(control => (
        control.closest('.jpdb-subtitle-rail')?.classList.contains('jpdb-subtitle-rail-dragging') ?? false
    ));
    assert(!dragging, 'ipad-focused-rail: pointer gesture left rail drag active');
    return focused;
}

async function capturePageCopyBoundary(page) {
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

    const shortcut = process.platform === 'darwin' ? 'Meta' : 'Control';
    const previousClipboard = ENGINE_NAME === 'chromium'
        ? await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
        : null;
    await page.keyboard.press(`${shortcut}+A`);
    let copiedText = await page.evaluate(() => document.getSelection()?.toString() ?? '');
    if (ENGINE_NAME === 'chromium') {
        try {
            await page.keyboard.press(`${shortcut}+C`);
            copiedText = await page.evaluate(() => navigator.clipboard.readText());
        } finally {
            await page.evaluate(text => navigator.clipboard.writeText(text), previousClipboard).catch(() => {});
        }
    }
    return {
        ...selectionUiReady,
        ordinaryPageTextSelected: copiedText.includes('Ordinary YouTube page text remains selectable.'),
        subtitleStatusSelected: copiedText.includes('No subtitle tracks detected yet.'),
        subtitleSettingsSelected: copiedText.includes('Reset defaults'),
        transcriptUiSelected: copiedText.includes('Transcript panel UI must not enter page copy.'),
    };
}

async function createControlsWakeContext(browser, { viewport, settings, inlineFullscreen }) {
    const resolvedViewport = viewport ?? { width: 1180, height: 820 };
    const ctx = await browser.newContext({
        viewport: resolvedViewport,
        hasTouch: true,
        isMobile: resolvedViewport.width < 900,
        bypassCSP: true,
        ...(ENGINE_NAME === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}),
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
    await ctx.route(/https:\/\/(?:api\.jiten\.moe|jpdb\.io)\/.*/, route => route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
    }));
    await ctx.route(/https:\/\/m\.youtube\.com\/(?!watch|api\/timedtext).*/, route => route.fulfill({ status: 204, body: '' }));
    await ctx.route(/https:\/\/(www\.)?(youtube\.com|google\.com|gstatic\.com|ytimg\.com)\/(?!watch|api\/timedtext).*/, route => route.fulfill({ status: 204, body: '' }));

    await addUserscriptGraphInitScripts(ctx, USERSCRIPT_PATH, {
        prefixContent: controlsWakePrelude(settings, inlineFullscreen),
    });
    return ctx;
}

async function runMode(browser, scenario) {
    const { name, settings, prepare, viewport, screenshot, mobile, inlineFullscreen, nudgeViewport, focusRail } = scenario;
    const ctx = await createControlsWakeContext(browser, { viewport, settings, inlineFullscreen });
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

    await enterInlineFullscreen(page, inlineFullscreen);
    await nudgeVisualViewport(page, nudgeViewport);
    const focusedRailBeforeIdle = await focusSubtitleRail(page, focusRail);

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
    const selectionProof = await capturePageCopyBoundary(page);
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
        assert(result.pageErrors.length === 0, `${result.name}: unexpected page error (${result.pageErrors.join(' | ')})`);
    } catch (error) {
        failed = true;
        console.error(String(error.message ?? error));
    }
}

if (failed) { console.error('FAIL youtube-controls-wake-smoke'); process.exit(1); }
console.log('PASS youtube-controls-wake-smoke');
