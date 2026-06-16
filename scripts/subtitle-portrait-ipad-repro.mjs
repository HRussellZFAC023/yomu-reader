#!/usr/bin/env node
// Reproduction harness for the iPad portrait-player rail bug: the subtitle
// control rail never appears on tall portrait custom players (the wrapper trips
// the viewport-sized guard so no player frame is resolved), while landscape
// players on the same device get the rail. Loads bespoke players one per page
// on an emulated iPad and reports the real has-video-frame / rail display state.
import { chromium, devices } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assertBuiltArtifacts,
    createSmokePaths,
    startLoopbackServer,
    closeServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, root: ROOT, dist: DIST } = createSmokePaths(import.meta.dirname);
const VIDEO_COMPANION_PATH = `${DIST}/greasyfork/yomu-video.user.js`;
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, VIDEO_COMPANION_PATH], ROOT);

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    // 'always' makes display:none vs shown unambiguous; YOMU_REPRO_MODE=auto
    // exercises the default idle behaviour (rail fades out while watching).
    subtitleControlsMode: process.env.YOMU_REPRO_MODE || 'always',
};

// A bespoke JS player: native controls OFF, div-based control chrome, a wrapper
// class that does not match the known-player regex on its own. `w`/`h` are the
// rendered player size; portrait-tall is sized to exceed 90% of the iPad
// portrait viewport height (1194) the way a real reels/shorts-style page does.
function playerFixture({ label, w, h, wrapperClass = 'stage' }) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font-family:sans-serif;background:#111;color:#eee;display:flex;justify-content:center;padding:24px}
  .${wrapperClass}{position:relative;width:${w}px;height:${h}px;background:#000}
  .${wrapperClass} video{width:100%;height:100%;object-fit:cover;display:block}
  .bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;padding:10px;background:rgba(0,0,0,.5);opacity:0;transition:opacity .2s}
  .${wrapperClass}:hover .bar{opacity:1}
  .bar .ctrl{width:40px;height:40px;border-radius:6px;background:#333;display:grid;place-items:center;cursor:pointer}
</style></head><body>
  <h3 style="position:fixed;top:4px;left:8px;margin:0;font-size:12px">${label} ${w}x${h}</h3>
  <div class="${wrapperClass}">
    <video playsinline muted loop preload="auto">
      <source src="https://test.invalid/none.mp4" type="video/mp4">
    </video>
    <div class="bar">
      <div class="ctrl" role="button" aria-label="Play">&#9658;</div>
      <div class="ctrl" role="button" aria-label="Mute">&#128266;</div>
      <div class="ctrl" role="button" aria-label="Fullscreen">&#9974;</div>
    </div>
  </div>
</body></html>`;
}

// Wrapper classes contain "media"/"player" so isLikelyGenericPlayerFrame matches
// (as real .video-js/.plyr players do) — isolating size/orientation as the only
// variable. Landscape & small portrait stay under the viewport-size guard;
// portrait-tall exceeds 90% of the 1194px iPad portrait height.
const cases = [
    { label: 'landscape', w: 720, h: 405, wrapperClass: 'media-stage' },
    { label: 'portrait-small', w: 360, h: 640, wrapperClass: 'media-reel' },
    { label: 'portrait-tall', w: 672, h: 1140, wrapperClass: 'media-reel-tall' }, // ~96% of 1194 → trips height guard
];

const fixtures = new Map(cases.map(c => [`/${c.label}`, playerFixture(c)]));
const { server, baseUrl } = await startLoopbackServer((req, res) => {
    const html = fixtures.get(new URL(req.url, baseUrl).pathname);
    if (!html) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
});

const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const c of cases) results.push(await runCase(c));
} finally {
    await browser.close();
    await closeServer(server);
}

console.log(JSON.stringify({ baseUrl, results }, null, 2));

async function runCase(c) {
    const context = await browser.newContext({ ...devices['iPad Pro 11'], bypassCSP: true });
    const page = await context.newPage();
    try {
        await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
        await page.goto(`${baseUrl}/${c.label}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        await addScriptTagWithCspFallback(page, VIDEO_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForTimeout(3500);
        // The userscript pins controls 'always', so rail display is the gate.
        return { case: c.label, ...await page.evaluate(diagnose, c.wrapperClass) };
    } catch (error) {
        return { case: c.label, failed: String(error).slice(0, 200) };
    } finally {
        await context.close();
    }
}

function diagnose(wrapperClass) {
    const root = document.querySelector('.jpdb-subtitle-player');
    const rail = document.querySelector('.jpdb-subtitle-rail');
    const video = document.querySelector('video');
    const wrapper = document.querySelector(`.${wrapperClass}`);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const vRect = video?.getBoundingClientRect();
    const wRect = wrapper?.getBoundingClientRect();
    return {
        viewport: { vw, vh },
        videoRect: vRect ? { w: Math.round(vRect.width), h: Math.round(vRect.height) } : null,
        wrapperRect: wRect ? { w: Math.round(wRect.width), h: Math.round(wRect.height) } : null,
        // mirrors isViewportSizedVideoRect(wrapper) — the parent guard in shouldUseGenericVideoParent
        wrapperViewportSizedByWidth: wRect ? wRect.width > vw * 0.92 : null,
        wrapperViewportSizedByHeight: wRect ? wRect.height > vh * 0.9 : null,
        videoHasNativeControls: Boolean(video?.controls),
        yomuInstalled: Boolean(root),
        hasVideoFrameClass: Boolean(root?.classList.contains('jpdb-subtitle-has-video-frame')),
        outOfViewClass: Boolean(root?.classList.contains('jpdb-subtitle-video-out-of-view')),
        rootHidden: root ? root.hidden : null,
        railDisplay: rail ? getComputedStyle(rail).display : 'NO-RAIL',
        railVisible: Boolean(rail && getComputedStyle(rail).display !== 'none'),
        idleClass: Boolean(root?.classList.contains('jpdb-subtitle-controls-idle')),
        railOpacity: rail ? getComputedStyle(rail).opacity : null,
    };
}
