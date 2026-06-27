#!/usr/bin/env node
// Browser proof for the BookWalker modes Canna hit on iPad:
// 1) two visible spread pages where only one viewport carries .currentScreen
// 2) continuous vertical scroll (BookWalker settings: ページ移動方向 = 縦) where
//    .currentScreen can be left on an offscreen viewport while the user taps a
//    later visible page.
// Both cases use real Playwright touch events and the built userscript bundle.
import { chromium, firefox, webkit } from 'playwright';
import path from 'node:path';
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'bookwalker-modes-ocr');
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video']
    .map(name => path.join(DIST, 'greasyfork', `${name}.user.js`));
const BRIDGE = '__yomuBookwalkerModesRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-mode.png';
const failures = [];
const rows = [];
mkdirSync(ARTIFACT_DIR, { recursive: true });

const CRC = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();
const crc32 = buffer => {
    let c = ~0;
    for (let i = 0; i < buffer.length; i++) c = CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
};
const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, checksum]);
};

function makePng(width = 200, height = 280) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    let offset = 0;
    for (let y = 0; y < height; y++) {
        raw[offset++] = 0;
        for (let x = 0; x < width; x++) {
            const ink = (x % 38 < 16 && y % 54 < 36) || (x + y) % 41 < 4;
            const value = ink ? 0 : 246;
            raw[offset++] = value;
            raw[offset++] = value;
            raw[offset++] = value;
            raw[offset++] = 255;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const PAGE_PNG = makePng();
const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
    ocrEnabled: true,
    ocrAutoScanImages: false,
    ocrShowTextOverlay: true,
    ocrProvider: 'local-service',
    ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
};
const MOCK_OCR = {
    width: 800,
    height: 1130,
    lines: [{ text: 'ページ移動方向', box: { x: 64, y: 180, w: 420, h: 88 }, vertical: false }],
};

function spreadFixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#111;height:100%;overflow:hidden}
#renderer{position:relative;width:900px;height:1120px;margin:0 auto}
.viewport{position:absolute;top:20px}
#viewport0{left:28px}#viewport1{left:462px}
canvas{display:block;width:410px;height:580px;background:#fff}
#pageSliderCounter{position:fixed;right:24px;bottom:16px;color:white}
</style></head><body>
<div id="viewer"><div id="renderer">
  <div id="viewport0" class="viewport currentScreen"><canvas id="left" width="800" height="1130"></canvas></div>
  <div id="viewport1" class="viewport"><canvas id="right" width="800" height="1130"></canvas></div>
</div></div><span id="pageSliderCounter">13 / 195</span>
<script>${drawScript()}</script></body></html>`;
}

function continuousFixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#111;min-height:3900px}
#renderer{position:relative;width:900px;margin:0 auto}
.viewport{position:absolute;left:70px}
#viewport0{top:0}#viewport1{top:1260px}#viewport2{top:2520px}
canvas{display:block;width:760px;height:1074px;background:#fff}
#pageSliderCounter{position:fixed;right:24px;bottom:16px;color:white}
</style></head><body>
<div id="viewer"><div id="renderer">
  <div id="viewport0" class="viewport currentScreen"><canvas id="p0" width="800" height="1130"></canvas></div>
  <div id="viewport1" class="viewport"><canvas id="p1" width="800" height="1130"></canvas></div>
  <div id="viewport2" class="viewport"><canvas id="p2" width="800" height="1130"></canvas></div>
</div></div><span id="pageSliderCounter">13 / 195</span>
<script>${drawScript()}</script></body></html>`;
}

function drawScript() {
    return `
window.__draw = async () => {
  const img = new Image(); img.src = ${JSON.stringify(IMG_URL)};
  try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const canvas of document.querySelectorAll('canvas')) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const buffer = document.createElement('canvas');
    buffer.width = canvas.width; buffer.height = canvas.height;
    const b = buffer.getContext('2d');
    b.fillStyle = '#fff'; b.fillRect(0, 0, buffer.width, buffer.height);
    b.drawImage(img, 0, 0, buffer.width, buffer.height);
    ctx.drawImage(buffer, 0, 0, buffer.width, buffer.height, 0, 0, canvas.width, canvas.height);
  }
  return 'drawn';
};
window.__watchFrameChurn = () => {
  window.__yomuFrameRemovals = 0;
  const isFrame = node => node?.nodeType === Node.ELEMENT_NODE && (node.matches?.('.jpdb-ocr-canvas-frame') || node.querySelector?.('.jpdb-ocr-canvas-frame'));
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) if (isFrame(node)) window.__yomuFrameRemovals++;
    }
  }).observe(document.body, { childList: true, subtree: true });
};`;
}

async function installYomu(page) {
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const companion of COMPANIONS) await addScriptTagWithCspFallback(page, companion).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(350);
}

async function runCase(engineName, mode) {
    const engine = engineName === 'webkit' ? webkit : engineName === 'firefox' ? firefox : chromium;
    const label = `${engineName}/${mode}`;
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
    const page = await context.newPage();
    let ocrHits = 0;
    await page.exposeFunction(BRIDGE, async request => {
        const url = request.url || '';
        if (url === IMG_URL) return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' };
        if (/7331|\/ocr(\?|$)/.test(url)) {
            ocrHits++;
            return { status: 200, responseText: JSON.stringify(MOCK_OCR) };
        }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
        const parsed = new URL(url);
        if (parsed.href === IMG_URL) return route.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG });
        if (parsed.hostname === 'viewer.bookwalker.jp') {
            return route.fulfill({
                status: 200,
                contentType: 'text/html; charset=utf-8',
                body: mode === 'continuous' ? continuousFixtureHtml() : spreadFixtureHtml(),
            });
        }
        return route.fulfill({ status: 404, body: '' });
    });

    await page.goto('https://viewer.bookwalker.jp/de_modes/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installYomu(page);
    if (mode === 'continuous') await page.evaluate(() => window.scrollTo(0, 1220));
    await page.waitForTimeout(250);
    const selector = mode === 'continuous' ? '#p1' : '#right';
    const point = await page.evaluate(sel => {
        const rect = document.querySelector(sel).getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + 150) };
    }, selector);
    await page.touchscreen.tap(point.x, point.y);
    const start = Date.now();
    let overlayMs = -1;
    let statusSeen = false;
    let frameSeen = false;
    while (Date.now() - start < 8000) {
        const readiness = await page.evaluate(() => ({
            status: document.querySelectorAll('.jpdb-ocr-video-frame-status').length,
            frames: document.querySelectorAll('.jpdb-ocr-canvas-frame, .jpdb-ocr-background-frame').length,
            lines: document.querySelectorAll('.jpdb-ocr-line').length,
        }));
        statusSeen ||= readiness.status >= 1;
        frameSeen ||= readiness.frames >= 1;
        if (readiness.lines >= 1) {
            overlayMs = Date.now() - start;
            break;
        }
        await page.waitForTimeout(100);
    }
    let frameSurvived = true;
    let removals = 0;
    if (mode === 'continuous' && overlayMs >= 0) {
        const frame = await page.$('.jpdb-ocr-canvas-frame');
        await page.evaluate(() => window.__watchFrameChurn());
        await page.evaluate(() => window.scrollBy(0, 80));
        await page.waitForTimeout(1700);
        frameSurvived = await frame.evaluate(node => node.isConnected).catch(() => false);
        removals = await page.evaluate(() => window.__yomuFrameRemovals || 0);
    }
    const statusCount = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-video-frame-status').length);
    const frameCount = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-canvas-frame, .jpdb-ocr-background-frame').length);
    const lineCount = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line').length);
    const screenshot = path.join(ARTIFACT_DIR, `${engineName}-${mode}.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);
    statusSeen ||= statusCount >= 1;
    frameSeen ||= frameCount >= 1;
    const ok = overlayMs >= 0 && ocrHits >= 1 && statusSeen && frameSeen && lineCount >= 1 && frameSurvived && removals === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — overlay ${overlayMs >= 0 ? overlayMs + 'ms' : 'NEVER'}, ocrHits=${ocrHits}, statusSeen=${statusSeen}, finalStatus=${statusCount}, frameSeen=${frameSeen}, finalFrames=${frameCount}, lines=${lineCount}, frameSurvived=${frameSurvived}, removals=${removals}`);
    rows.push({ label, ok, overlayMs, ocrHits, statusSeen, statusCount, frameSeen, frameCount, lineCount, frameSurvived, removals, screenshot });
    if (!ok) failures.push(label);
    await context.close();
    await browser.close();
}

for (const engineName of ['firefox', 'webkit', 'chromium']) {
    for (const mode of ['spread', 'continuous']) {
        try {
            await runCase(engineName, mode);
        } catch (error) {
            const label = `${engineName}/${mode}`;
            console.log(`ERROR ${label}: ${String(error).slice(0, 180)}`);
            failures.push(`${label} crashed`);
        }
    }
}

console.log('\n================ SUMMARY ================');
for (const row of rows) {
    console.log(`${row.label.padEnd(26)} ${row.ok ? 'ok' : 'failed'} ${row.screenshot ? `(${row.screenshot})` : ''}`);
}
writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(rows, null, 2));
console.log(failures.length
    ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}`
    : `\nALL PASS — BookWalker spread and continuous-scroll taps OCR without frame churn. Artifacts: ${ARTIFACT_DIR}`);
process.exit(failures.length ? 1 : 0);
