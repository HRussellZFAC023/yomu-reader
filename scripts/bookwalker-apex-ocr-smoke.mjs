#!/usr/bin/env node
// Browser proof for the apex-host BookWalker OCR fix. BookWalker paints DRM pages
// onto a cross-origin-tainted <canvas>; OCR reads it only by replaying recorded
// draw ops onto an origin-clean canvas from GM-fetched clean sources (canvas
// mirror). That path is gated on isBookwalkerViewerHost(); before the fix it
// matched viewer.* but NOT the apex bookwalker.jp where the reader is also served
// (iOS Safari's address bar hides the subdomain), so OCR silently produced no
// overlay on the comic. Serves an NFBR-shaped fixture from the real hosts via
// route interception (genuine location.hostname), taints the canvas with a cross-
// origin draw, hovers it, asserts an overlay appears — on WebKit (the Safari engine
// the iPad uses) and Chromium, apex vs viewer, single + double spread.
// Baseline: apex FAILS both engines, viewer works. Fixed: all eight pass.
// Requires `npm run build` first (OCR ships in the yomu-video companion).
import { chromium, webkit, devices } from 'playwright';
import path from 'node:path';
import zlib from 'node:zlib';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video']
    .map(name => path.join(DIST, 'greasyfork', `${name}.user.js`));
const BRIDGE = '__yomuApexOcrRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-001.png';

const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = ~0; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, cc]); };
function makePng(w = 200, h = 280, invert = false) {
    const raw = Buffer.alloc((w * 4 + 1) * h); let o = 0;
    for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { let v = ((x % 40 < 22) && (y % 50 < 30)) ? 0 : ((x + y) % 3 === 0 ? 96 : 255); if (invert) v = 255 - v; raw[o++] = v; raw[o++] = v; raw[o++] = v; raw[o++] = 255; } }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Two visually-distinct page images so a turn to page 2 is a genuine content change
// (re-OCR), and turning BACK to page 1 is the same content (cache hit — guards the
// content-keyed OCR cache that stops re-OCRing a revisited page).
const PAGE_PNG = makePng(200, 280, false);
const PAGE_PNG_2 = makePng(200, 280, true);
const IMG_URL_2 = 'https://c.bookwalker.jp/scrambled/page-002.png';

function fixtureHtml({ double }) {
    const cv = id => `<div class="wideScreen" id="wideScreen_${id}"><canvas class="default" id="${id}" width="800" height="1130"></canvas></div>`;
    const canvases = double ? cv('cR') + cv('cL') : cv('c0');
    const w = double ? '47vw,380px' : '94vw,760px';
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;background:#111;height:100%}#bookContainer{display:flex;justify-content:center;padding:8px}
.wideScreen{position:relative}canvas.default{display:block;width:min(${w});height:auto;background:#fff}</style></head>
<body><div id="bookContainer">${canvases}</div><div id="toolbar">Page <span id="pageSliderCounter">1 / 10</span></div>
<script>
// NFBR-faithful paint: clear the on-screen canvas, render the page into an
// off-screen buffer, then composite buffer→screen (a canvas→canvas drawImage).
// The full clear + the composite are exactly what the mirror recorder watches to
// detect a page turn, so re-running __draw simulates a real turn.
window.__draw = async (pageNum) => {
  const img = new Image(); img.src = (pageNum === 2) ? ${JSON.stringify(IMG_URL_2)} : ${JSON.stringify(IMG_URL)};
  try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const buffer = document.createElement('canvas'); buffer.width = c.width; buffer.height = c.height;
    const bx = buffer.getContext('2d'); bx.fillStyle = '#fff'; bx.fillRect(0, 0, c.width, c.height);
    bx.drawImage(img, 0, 0, c.width, c.height);
    x.drawImage(buffer, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
  }
  return 'drawn';
};
</script></body></html>`;
}

const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' };
const MOCK_OCR = { width: 800, height: 1130, lines: [{ text: '大変な事', box: { x: 60, y: 210, w: 320, h: 64 }, vertical: false }] };
const failures = [];
const rows = [];
const ENGINES = { webkit, chromium };

async function runCase({ engineName, host, double, deviceName }) {
    const engine = ENGINES[engineName];
    const label = `${engineName}/${host}/${double ? 'double' : 'single'}/${deviceName}`;
    const browser = await engine.launch({ headless: true });
    const deviceProfile = deviceName === 'desktop' ? { viewport: { width: 1280, height: 900 } } : devices[deviceName];
    const context = await browser.newContext({ ...deviceProfile, locale: 'ja-JP', bypassCSP: true });
    const page = await context.newPage();
    let ocrHits = 0;
    await page.exposeFunction(BRIDGE, async request => {
        const url = request.url || '';
        if (url === IMG_URL) return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' };
        if (url === IMG_URL_2) return { status: 200, bytes: [...PAGE_PNG_2], contentType: 'image/png', responseText: '' };
        if (/127\.0\.0\.1:7331|\/ocr(\?|$)/.test(url)) { ocrHits++; return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    await context.route('**/*', route => {
        const reqUrl = route.request().url();
        if (reqUrl.startsWith('blob:') || reqUrl.startsWith('data:')) return route.continue();
        const u = new URL(reqUrl);
        if (u.href === IMG_URL) return route.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG });
        if (u.href === IMG_URL_2) return route.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG_2 });
        if (u.hostname === host) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml({ double }) });
        return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`https://${host}/de_abc123/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(600);
    const sel = double ? '#cR' : '#c0';
    const center = async () => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80) }; }, sel);
    const lineCount = () => page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line').length);
    const waitFor = async predicate => { const start = Date.now(); while (Date.now() - start < 8000) { if (await predicate()) return Date.now() - start; await page.waitForTimeout(100); } return -1; };
    const hasTouch = deviceName !== 'desktop';
    // Trigger a scan the way the device would: a tap on touch, a hover on desktop.
    const trigger = async () => {
        const p = await center();
        if (hasTouch) await page.touchscreen.tap(p.x, p.y);
        else { await page.mouse.move(p.x, p.y); await page.mouse.move(p.x + 3, p.y + 2); }
    };

    // 1) First page OCRs (mirror replay → overlay).
    await trigger();
    const ms = await waitFor(async () => (await lineCount()) >= 1);
    const firstOk = ms >= 0;

    // 2) Turn to a DIFFERENT page (NFBR repaints the in-place canvas + bumps the
    //    counter) and re-trigger: the overlay must re-OCR the NEW page, not stay
    //    stale ("stuck after a page turn, must refresh").
    const hitsBeforeTurn = ocrHits;
    await page.evaluate(() => { const c = document.querySelector('#pageSliderCounter'); if (c) c.textContent = '2 / 10'; });
    await page.evaluate(() => window.__draw(2));
    await page.waitForTimeout(300);
    const staleClearMs = await waitFor(async () => (await lineCount()) === 0);
    const staleCleared = staleClearMs >= 0;
    await trigger();
    const turnMs = await waitFor(async () => ocrHits > hitsBeforeTurn && (await lineCount()) >= 1);
    const turnOk = turnMs >= 0;

    // 3) Turn BACK to page 1 (same content as the first scan): the content-keyed OCR
    //    cache must serve it WITHOUT calling OCR again (no re-OCR on revisit).
    await page.waitForTimeout(200);
    const hitsBeforeBack = ocrHits;
    await page.evaluate(() => { const c = document.querySelector('#pageSliderCounter'); if (c) c.textContent = '1 / 10'; });
    await page.evaluate(() => window.__draw(1));
    await page.waitForTimeout(300);
    await trigger();
    const backOverlay = await waitFor(async () => (await lineCount()) >= 1);
    await page.waitForTimeout(600); // give any (unwanted) re-OCR time to fire
    const cacheOk = backOverlay >= 0 && ocrHits === hitsBeforeBack; // overlay shown, but no new OCR call

    const ok = firstOk && staleCleared && turnOk && cacheOk;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — first ${firstOk ? ms + 'ms' : 'NO OVERLAY'}, stale-clear ${staleCleared ? staleClearMs + 'ms' : 'NO'}, page-turn ${turnOk ? 're-OCR ' + turnMs + 'ms' : 'NOT re-OCR\'d'}, back-cache ${cacheOk ? 'hit (no re-OCR)' : `MISS (${ocrHits - hitsBeforeBack} re-OCR)`}`);
    if (!ok) failures.push(label);
    rows.push({ label, ok, ms, turnOk, cacheOk });
    await context.close();
    await browser.close();
}

// Core matrix: both engines × apex/viewer hosts × single/double spread, on the iPad
// (the device the report came from). Plus a small cross-device pass (iPhone touch +
// desktop hover) so tap and hover triggers are both covered on the Safari engine.
const CASES = [];
for (const engineName of ['webkit', 'chromium']) {
    for (const host of ['bookwalker.jp', 'viewer.bookwalker.jp']) {
        for (const double of [false, true]) {
            CASES.push({ engineName, host, double, deviceName: 'iPad Pro 11' });
        }
    }
}
CASES.push({ engineName: 'webkit', host: 'viewer.bookwalker.jp', double: false, deviceName: 'iPhone 13' });
CASES.push({ engineName: 'webkit', host: 'viewer.bookwalker.jp', double: false, deviceName: 'desktop' });
CASES.push({ engineName: 'chromium', host: 'viewer.bookwalker.jp', double: false, deviceName: 'desktop' });

for (const testCase of CASES) {
    try { await runCase(testCase); }
    catch (e) { const label = `${testCase.engineName}/${testCase.host}/${testCase.double ? 'double' : 'single'}/${testCase.deviceName}`; console.log(`ERROR ${label}: ${String(e).slice(0, 160)}`); failures.push(`${label} crashed`); }
}
console.log('\n================ SUMMARY ================');
for (const r of rows) console.log(`${r.label.padEnd(40)} ${r.ok ? 'OCR ' + r.ms + 'ms' : 'NO OCR'}`);
console.log(failures.length ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}` : '\nALL PASS — apex + viewer OCR on WebKit and Chromium');
process.exit(failures.length ? 1 : 0);
