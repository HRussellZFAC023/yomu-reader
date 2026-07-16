#!/usr/bin/env node
// Browser proof that a BookWalker canvas tap whose page is composited BUT whose OCR
// capture isn't ready yet still OCRs on its own — without a second tap. In tap/manual
// mode the background poll never spends an OCR call; only a user tap captures. When
// the tapped page's tainted-canvas mirror rebuild transiently fails (the origin-clean
// page image hasn't finished loading / the GM fetch races — common right after a turn,
// especially on a REVISITED page the engine settles a beat late), the first capture
// returns nothing and schedules a retry. That retry runs through
// refreshCanvasReaderSurfaces, which early-returns in tap mode unless the capture is
// re-flagged user-requested — so before the fix the page stayed blank with NO
// "Scanning…"/"Text ready" pill until the user tapped again (the reported
// "sometimes a page just has no OCR" bug). The page is already composited at tap time
// (stable page signature, exactly like a real tap), so this isolates the retry-mode
// bug rather than a spurious turn. Uses a plain touch context (NOT devices['iPad …']:
// the mobile-emulation scale desyncs tap(x,y) from layout). Requires `npm run build`.
import { chromium, webkit } from 'playwright';
import path from 'node:path';
import { createSmokePaths, addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuTapRetryRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-001.png';

const PAGE_PNG = makePng();

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
<div id="bookContainer"><div class="wideScreen"><canvas class="default" id="c0" width="800" height="1130" style="width:760px;height:auto;background:#fff"></canvas></div></div>
<div>Page <span id="pageSliderCounter">1 / 10</span></div>
<script>
// NFBR-faithful paint: clear, render into an off-screen buffer, composite buffer->screen.
// The cross-origin image taints the canvas, so OCR must replay the recorded mirror ops.
window.__draw = async () => { const img = new Image(); img.src = ${JSON.stringify(IMG_URL)}; try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) { const x = c.getContext('2d'); x.clearRect(0,0,c.width,c.height); const b = document.createElement('canvas'); b.width=c.width; b.height=c.height; const bx=b.getContext('2d'); bx.fillStyle='#fff'; bx.fillRect(0,0,c.width,c.height); bx.drawImage(img,0,0,c.width,c.height); x.drawImage(b,0,0,c.width,c.height,0,0,c.width,c.height); } return 'drawn'; };
</script></body></html>`;
}
// Tap/manual mode (ocrAutoScanImages:false) — the poll must NOT auto-OCR; only a tap does.
const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' };
const MOCK_OCR = { width: 800, height: 1130, lines: [{ text: '大変な事', box: { x: 40, y: 160, w: 420, h: 90 }, vertical: false }] };
const failures = [];
const rows = [];

// mode 'ready'         : page composited + image fetchable before the tap (control — must work).
// mode 'mirror-delayed': page composited, but the origin-clean page image isn't fetchable
//                        until ~300ms after the tap (mirror rebuild fails on the first
//                        attempt). The page signature is STABLE the whole time (no turn),
//                        so only the retry-mode bug can keep it blank. ONE tap, no second.
async function runCase(engineName, mode) {
    const engine = engineName === 'webkit' ? webkit : chromium;
    const label = `${engineName}/${mode}`;
    const browser = await engine.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
    const page = await ctx.newPage();
    let ocrHits = 0;
    let cleanImageFetchable = mode !== 'mirror-delayed'; // gates the GM clean-image fetch only
    // Bridge handles GM_xmlhttpRequest: the origin-clean mirror image AND the OCR endpoint.
    // Failing IMG_URL here (not in the page route below) models the clean copy being
    // momentarily unavailable while the page itself stays painted/tainted on screen.
    await page.exposeFunction(BRIDGE, async req => {
        const u = req.url || '';
        if (u === IMG_URL) { if (!cleanImageFetchable) return { status: 503, responseText: '' }; return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' }; }
        if (/7331|\/ocr(\?|$)/.test(u)) { ocrHits++; return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    // The page's OWN image load (used by __draw to paint+taint the canvas) always succeeds.
    await ctx.route('**/*', r => { const url = r.request().url(); if (url.startsWith('blob:') || url.startsWith('data:')) return r.continue(); const u = new URL(url); if (u.href === IMG_URL) return r.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG }); if (u.hostname === 'viewer.bookwalker.jp') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml() }); return r.fulfill({ status: 404, body: '' }); });
    await page.goto('https://viewer.bookwalker.jp/de_x/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }).catch(() => {}));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);

    // Composite the page FIRST so the canvas is painted + the mirror ops are recorded
    // and the page signature is settled — exactly the state a user taps in.
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(300);

    const p = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 110) }; });
    await page.touchscreen.tap(p.x, p.y); // exactly one tap
    if (mode === 'mirror-delayed') { await page.waitForTimeout(300); cleanImageFetchable = true; } // page image becomes available shortly after

    const lineCount = () => page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line').length);
    const start = Date.now(); let ms = -1;
    while (Date.now() - start < 8000) { if (await lineCount() >= 1) { ms = Date.now() - start; break; } await page.waitForTimeout(100); }
    const ok = ms >= 0 && ocrHits >= 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — overlay ${ms >= 0 ? ms + 'ms' : 'NEVER (no pill, blank page)'} (ocrHits=${ocrHits}, single tap only)`);
    if (!ok) failures.push(label);
    rows.push({ label, ok });
    await ctx.close();
    await browser.close();
}

for (const engineName of ['webkit', 'chromium']) {
    for (const mode of ['ready', 'mirror-delayed']) {
        try { await runCase(engineName, mode); }
        catch (e) { const label = `${engineName}/${mode}`; console.log(`ERROR ${label}: ${String(e).slice(0, 160)}`); failures.push(`${label} crashed`); }
    }
}
console.log('\n================ SUMMARY ================');
for (const r of rows) console.log(`${r.label.padEnd(28)} ${r.ok ? 'OCR ok' : 'NO OCR'}`);
console.log(failures.length ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}` : '\nALL PASS — a tap whose capture isn\'t ready yet still OCRs without a second tap');
process.exit(failures.length ? 1 : 0);
