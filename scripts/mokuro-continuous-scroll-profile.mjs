#!/usr/bin/env node
// Repro: mokuro "continuous scroll" jank. Builds a tall column of manga page
// <img>s, each carrying inline `data-ocr-lines` so the real userscript OCR
// controller renders overlays with NO network (readFallbackOcrResult path).
// Then it scrolls and counts the layout reads (getBoundingClientRect /
// getComputedStyle) the OCR reposition frame performs, plus wall-clock — the
// metric that scales with the continuous-scroll page jank on iPad.
import { chromium } from 'playwright';
import process from 'node:process';
import zlib from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addGmStorageBridgeInitScript, startLoopbackServer } from './lib/smoke-harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const USERSCRIPT_PATH = resolve(SCRIPT_DIR, '..', 'dist', 'yomu.user.js');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const PAGES = Number(process.env.PAGES || 24);
const LINES_PER_PAGE = Number(process.env.LINES || 12);
const CPU_THROTTLE = Number(process.env.CPU || 4); // simulate a slower (iPad-ish) device
const IMG_W = 800;
const IMG_H = 1160;

// --- Build a valid solid-colour PNG of a given size with zlib (no deps). ---
function solidPng(width, height, [r, g, b]) {
    const rowBytes = width * 3 + 1; // 1 filter byte (0) per scanline + RGB
    const raw = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
        const o = y * rowBytes;
        raw[o] = 0;
        for (let x = 0; x < width; x++) {
            const p = o + 1 + x * 3;
            raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
        }
    }
    const idat = zlib.deflateSync(raw);
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
        return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit, colour type 2 (RGB)
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
    return `data:image/png;base64,${png.toString('base64')}`;
}
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return ~c;
}

// Vertical Japanese OCR lines spread across the page (source-pixel boxes).
function pageOcrLines() {
    const sample = ['始めるか', 'まだ梅雨にも', '入っとらんと', 'いうのに', '暑いなぁ', 'こんな時', 'だって', '天気の話', 'まいったな', 'じゃあ', 'いこうか', 'ありがとう'];
    const lines = [];
    for (let i = 0; i < LINES_PER_PAGE; i++) {
        const text = sample[i % sample.length];
        const col = i % 4;
        const row = Math.floor(i / 4);
        const w = 60;
        const h = 40 + text.length * 34;
        lines.push({
            text,
            box: { left: 80 + col * 170, top: 60 + row * 360, width: w, height: h },
            vertical: true,
        });
    }
    return lines;
}

function fixtureHtml() {
    const img = solidPng(40, 58, [238, 238, 238]); // small intrinsic; rendered at IMG_W×IMG_H
    const ocr = JSON.stringify(pageOcrLines()).replace(/'/g, '&#39;');
    const pages = Array.from({ length: PAGES }, (_, i) => `
    <div class="page" id="page${i + 1}">
      <img class="pageImage" width="${IMG_W}" height="${IMG_H}" src="${img}"
           data-ocr-lines='${ocr}' alt="page ${i + 1}" data-page="${i + 1}">
    </div>`).join('\n');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>mokuro continuous-scroll repro</title>
<style>
  html,body{margin:0;background:#111}
  .page{display:flex;justify-content:center}
  img.pageImage{display:block;width:${IMG_W}px;height:${IMG_H}px;image-rendering:auto}
</style></head><body>${pages}</body></html>`;
}

const settings = {
    apiKey: '',
    onboardingSeen: true,
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: true,
    ocrProvider: 'google-lens',
    showFloatingButton: true,
    interfaceLanguage: 'en',
};

const fixture = await startLoopbackServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fixtureHtml());
});
const ORIGIN = fixture.origin;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });

await page.addInitScript((key) => {
    // Count layout reads, but only while a measurement window is open.
    window.__yomuMeasuring = false;
    window.__yomuCounts = { rect: 0, style: 0, frames: 0, frameMs: 0 };
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
        if (window.__yomuMeasuring) window.__yomuCounts.rect++;
        return origRect.apply(this, arguments);
    };
    const origStyle = window.getComputedStyle.bind(window);
    window.getComputedStyle = function () {
        if (window.__yomuMeasuring) window.__yomuCounts.style++;
        return origStyle.apply(window, arguments);
    };
    void key;
}, SETTINGS_KEY);

await page.addInitScript(({ s, key }) => { localStorage.setItem(key, JSON.stringify(s)); }, { s: settings, key: SETTINGS_KEY });
await addGmStorageBridgeInitScript(page, { key: SETTINGS_KEY, value: settings, css: '' });

await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
await page.addScriptTag({ content: await readFile(USERSCRIPT_PATH, 'utf8') });

// Let OCR overlays render for the pages near the top.
await page.waitForSelector('.jpdb-ocr-line', { timeout: 15000 });
await page.waitForTimeout(800);

// CPU throttle to approximate an iPad's main-thread budget.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

async function measureScrollBurst(steps = 40, dy = 60) {
    await page.evaluate(() => {
        window.__yomuCounts = { rect: 0, style: 0, frames: 0, frameMs: 0 };
        window.__yomuMeasuring = true;
    });
    const t0 = await page.evaluate(() => performance.now());
    for (let i = 0; i < steps; i++) {
        await page.evaluate((d) => new Promise((done) => {
            window.scrollBy(0, d);
            const f0 = performance.now();
            requestAnimationFrame(() => requestAnimationFrame(() => {
                window.__yomuCounts.frames++;
                window.__yomuCounts.frameMs += performance.now() - f0;
                done();
            }));
        }, dy);
    }
    const result = await page.evaluate((t) => {
        window.__yomuMeasuring = false;
        return {
            ...window.__yomuCounts,
            wallMs: performance.now() - t,
            overlays: document.querySelectorAll('.jpdb-ocr-line').length,
            states: document.querySelectorAll('.jpdb-ocr-layer').length,
        };
    }, t0);
    return result;
}

const burst = await measureScrollBurst();
const report = {
    pages: PAGES,
    linesPerPage: LINES_PER_PAGE,
    cpuThrottle: CPU_THROTTLE,
    overlayLinesLive: burst.overlays,
    ocrLayers: burst.states,
    scrollFrames: burst.frames,
    getBoundingClientRectCalls: burst.rect,
    getComputedStyleCalls: burst.style,
    rectCallsPerFrame: +(burst.rect / Math.max(1, burst.frames)).toFixed(1),
    styleCallsPerFrame: +(burst.style / Math.max(1, burst.frames)).toFixed(1),
    avgFrameMs: +(burst.frameMs / Math.max(1, burst.frames)).toFixed(2),
    wallMs: Math.round(burst.wallMs),
};
console.log(JSON.stringify(report, null, 2));

await browser.close();
await fixture.close();
