#!/usr/bin/env node
// Browser proof that tapping OCR text on a BookWalker-style viewer looks the word
// up instead of turning the page. NFBR turns the page on a touchend/click on its
// canvas; Yomu's OCR overlay sits on top, but on touch WebKit can target the
// underlying canvas even when the OCR word is painted on top — so without the fix
// a text tap both misses the lookup AND flips the page (the reported bug). The fix
// (1) never re-scans when the tap point is over existing OCR text (so the overlay
// survives the tap) and (2) swallows the gesture at document-capture when it lands
// on the overlay (so the viewer's turn handler never fires). Asserts: a tap on the
// word turns the page 0 times AND opens the lookup; a tap on bare canvas still turns.
// Uses a plain WebKit/Chromium touch context (NOT devices['iPad …']) because the
// mobile-emulation screen scale desyncs tap(x,y) from layout coordinates.
// Requires `npm run build` first (OCR ships in the yomu-video companion).
import { chromium, firefox, webkit } from 'playwright';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSmokePaths, addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST, artifacts: ARTIFACTS } = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'bookwalker-tap-passthrough');
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuTapRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-001.png';

const PAGE_PNG = makePng();

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
<div id="bookContainer"><div class="wideScreen"><canvas class="default" id="c0" width="800" height="1130" style="width:760px;height:auto;background:#fff"></canvas></div></div>
<div>Page <span id="pageSliderCounter">1 / 10</span></div>
<script>
window.__turns = 0;
const turn = () => { window.__turns++; };
window.__armTurn = () => { for (const t of ['touchend','click']) { document.querySelector('#c0').addEventListener(t, turn); document.addEventListener(t, turn); } };
window.__draw = async () => { const img = new Image(); img.src = ${JSON.stringify(IMG_URL)}; try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) { const x = c.getContext('2d'); x.clearRect(0,0,c.width,c.height); const b = document.createElement('canvas'); b.width=c.width; b.height=c.height; const bx=b.getContext('2d'); bx.fillStyle='#fff'; bx.fillRect(0,0,c.width,c.height); bx.drawImage(img,0,0,c.width,c.height); x.drawImage(b,0,0,c.width,c.height,0,0,c.width,c.height); } return 'drawn'; };
</script></body></html>`;
}
const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr', lookupOnClick: true, popupActivationMode: 'click' };
const MOCK_OCR = { width: 800, height: 1130, lines: [{ text: 'ずっと秘密にしていた', box: { x: 40, y: 160, w: 420, h: 90 }, vertical: false }] };
const POPOVER_SEL = '.jpdb-reader-popover[data-jpdb-reader-root="true"]';
const failures = [];
const rows = [];
mkdirSync(ARTIFACT_DIR, { recursive: true });

async function runCase(engineName) {
    const engine = engineName === 'webkit' ? webkit : engineName === 'firefox' ? firefox : chromium;
    const browser = await engine.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
    const page = await ctx.newPage();
    await page.exposeFunction(BRIDGE, async req => { const u = req.url || ''; if (u === IMG_URL) return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' }; if (/7331|\/ocr(\?|$)/.test(u)) return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; return { status: 503, responseText: '' }; });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    await ctx.route('**/*', r => { const url = r.request().url(); if (url.startsWith('blob:') || url.startsWith('data:')) return r.continue(); const u = new URL(url); if (u.href === IMG_URL) return r.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG }); if (u.hostname === 'viewer.bookwalker.jp') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml() }); return r.fulfill({ status: 404, body: '' }); });
    await page.goto('https://viewer.bookwalker.jp/de_x/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }).catch(() => {}));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(300);
    // Scan the page (a bare-canvas tap — the genuine turn zone — renders the overlay).
    const c = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 110) }; });
    await page.touchscreen.tap(c.x, c.y);
    let rendered = false; const start = Date.now();
    while (Date.now() - start < 8000) { if (await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1) { rendered = true; break; } await page.waitForTimeout(100); }
    // Arm the page-turn handlers now (so the scan tap above doesn't count).
    await page.evaluate(() => { window.__armTurn(); window.__turns = 0; });
    // 1) Control FIRST (before any lookup popover can cover the margin): a bare-canvas
    // tap with no OCR text MUST still turn the page (we only swallow over the overlay).
    const margin = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width - 14), y: Math.round(r.top + r.height - 14) }; });
    await page.touchscreen.tap(margin.x, margin.y);
    await page.waitForTimeout(300);
    const marginTurns = await page.evaluate(() => window.__turns);
    // Re-scan settles the overlay back; wait for the word again, then reset the counter.
    const restart = Date.now();
    while (Date.now() - restart < 6000) { if (await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1) break; await page.waitForTimeout(100); }
    await page.evaluate(() => { window.__turns = 0; });
    const w = await page.evaluate(() => { const el = document.querySelector('.jpdb-ocr-line .jpdb-reader-word[data-expression="秘密"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
    const scannerIsolated = await page.evaluate(() => {
        const line = document.querySelector('.jpdb-ocr-line');
        if (!line) return false;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const visualText = [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
            .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
            .join('');
        return walker.nextNode() === null && visualText === 'ずっと秘密にしていた';
    });
    // 2) Tap the WORD: must NOT turn, must open the lookup, must keep the overlay.
    if (w) await page.touchscreen.tap(w.x, w.y);
    let popover = false;
    try {
        await page.waitForFunction(s => {
            const root = document.querySelector(s);
            return Boolean(
                root
                && root.getAttribute('role') === 'dialog'
                && root.querySelector('.jpdb-reader-popover-body')
                && root.querySelector('.jpdb-reader-spelling')?.textContent?.includes('秘密')
            );
        }, POPOVER_SEL, { timeout: 6000 });
        popover = true;
    } catch {
        popover = false;
    }
    const wordTurns = await page.evaluate(() => window.__turns);
    const overlayKept = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1;
    const screenshot = path.join(ARTIFACT_DIR, `${engineName}.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);

    const ok = rendered && w && scannerIsolated && wordTurns === 0 && popover && overlayKept && marginTurns > 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${engineName} — wordTurns=${wordTurns}(want 0) lookup=${popover} scannerIsolated=${scannerIsolated} overlayKept=${overlayKept} marginTurns=${marginTurns}(want >0)${rendered ? '' : ' [overlay never rendered]'}`);
    rows.push({ engineName, ok, rendered, wordTurns, popover, scannerIsolated, overlayKept, marginTurns, screenshot });
    if (!ok) failures.push(engineName);
    await ctx.close();
    await browser.close();
}

for (const engineName of ['firefox', 'webkit', 'chromium']) {
    try { await runCase(engineName); } catch (e) { console.log(`ERROR ${engineName}: ${String(e).slice(0, 160)}`); failures.push(engineName); }
}
writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(rows, null, 2));
console.log(failures.length ? `\nFAILURES: ${[...new Set(failures)].join(', ')}` : `\nALL PASS — OCR text taps look up the word without turning the page; bare taps still turn. Artifacts: ${ARTIFACT_DIR}`);
process.exit(failures.length ? 1 : 0);
