#!/usr/bin/env node
// Canna reader-feedback regression smoke (iPad emulation):
//  A. mokuro reader -> native .textBox words are read; redundant image OCR is
//     SUPPRESSED (no Google Lens request, no competing overlay) so accuracy +
//     no flicker.
//  B. BookWalker-style canvas viewer -> page <canvas> is snapshotted and OCR'd
//     (local-service mock), overlay renders, snapshot is pointer-transparent,
//     and a page turn re-snapshots.
import { chromium, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
// The OCR controller ships in the yomu-video @require companion; inject all
// companions (they self-register on window.__yomuCompanions) before the core.
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video']
    .map(name => path.join(DIST, 'greasyfork', `${name}.user.js`));
const BRIDGE = '__yomuCannaSmokeRequest';
const MOKURO_FIXTURE = 'file:///tmp/mokuro-repro/mokuro-reader.html';
const BW_FIXTURE = 'file://' + new URL('./fixtures/bookwalker-viewer.html', import.meta.url).pathname;

const MOCK_OCR = {
    width: 800, height: 1130, lines: [
        { text: '黒執事のOCRテスト', box: { x: 60, y: 120, w: 560, h: 60 }, vertical: false },
        { text: '大変な事になりました', box: { x: 60, y: 300, w: 480, h: 60 }, vertical: false },
    ],
};

const failures = [];
const pass = (name, cond, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failures.push(name);
};

// Ensure the mokuro fixture exists (built from the real cbz + .mokuro json).
try { execFileSync('node', ['scripts/lib/build-mokuro-fixture.mjs'], { stdio: 'ignore' }); } catch {}

const DEVICE = process.env.YOMU_DEVICE || 'iPad Pro 11';
const COARSE = DEVICE !== 'desktop';
const contextOpts = DEVICE === 'desktop'
    ? { viewport: { width: 1280, height: 900 }, locale: 'en-US', bypassCSP: true }
    : { ...devices[DEVICE], locale: 'en-US', bypassCSP: true };
console.log(`### device: ${DEVICE} (coarse pointer: ${COARSE}) ###`);
const browser = await chromium.launch({ headless: true });

async function newReaderPage(settings) {
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    const ocrRequests = [];
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.exposeFunction(BRIDGE, async request => {
        const url = request.url || '';
        if (/lensfrontend-pa\.googleapis\.com|lens\.google\.com/.test(url)) { ocrRequests.push({ provider: 'google-lens', url }); return { status: 200, responseText: '' }; }
        if (/vision\.googleapis\.com/.test(url)) { ocrRequests.push({ provider: 'cloud-vision', url }); return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        if (/127\.0\.0\.1:7331|\/ocr(\?|$)/.test(url)) { ocrRequests.push({ provider: 'local-service', url }); return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, requestBridgeName: BRIDGE });
    return { context, page, ocrRequests, errors };
}

async function inject(page) {
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const companion of COMPANIONS) await addScriptTagWithCspFallback(page, companion).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
}

// ---------- A. mokuro suppression ----------
{
    const { context, page, ocrRequests, errors } = await newReaderPage({
        onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false,
    });
    await page.goto(MOKURO_FIXTURE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await inject(page);
    await page.waitForTimeout(9000);
    const m = await page.evaluate(() => ({
        textBoxWords: document.querySelectorAll('.textBox .jpdb-reader-word').length,
        ocrLayers: document.querySelectorAll('.jpdb-ocr-layer').length,
        ocrLines: document.querySelectorAll('.jpdb-ocr-line').length,
        canvasFrames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
    }));
    console.log('[mokuro]', JSON.stringify(m), 'ocrRequests=', ocrRequests.length, 'errors=', errors.length);
    pass('mokuro: native textBox words read', m.textBoxWords > 0, `${m.textBoxWords} words`);
    pass('mokuro: NO image OCR request fired (Lens suppressed)', ocrRequests.length === 0);
    pass('mokuro: NO competing OCR overlay', m.ocrLayers === 0 && m.ocrLines === 0);
    // Touch reading: small dense manga words get an enlarged tap target on coarse pointers.
    const touch = await page.evaluate(() => {
        const w = document.querySelector('.textBox .jpdb-reader-word');
        if (!w) return { err: 'no word' };
        const before = getComputedStyle(w, '::before');
        return { hitExpander: before.content !== 'none' && before.content !== 'normal' && before.pointerEvents === 'auto' };
    });
    if (COARSE) pass('mokuro: touch hit-expander active on manga words (no-stylus tapping)', touch.hitExpander === true, JSON.stringify(touch));
    else pass('mokuro (desktop): no touch hit-expander (fine pointer)', touch.hitExpander === false, JSON.stringify(touch));
    await page.screenshot({ path: '/tmp/yomu-recon/verify-mokuro.png' });
    await context.close();
}

// ---------- B. BookWalker canvas OCR (local-service mock) ----------
{
    const { context, page, ocrRequests, errors } = await newReaderPage({
        onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false,
        ocrEnabled: true, ocrAutoScanImages: true, ocrProvider: 'local-service',
        ocrEndpointUrl: 'http://127.0.0.1:7331/ocr', ocrShowTextOverlay: true,
    });
    await page.goto(BW_FIXTURE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await inject(page);
    await page.waitForTimeout(9000);
    const b = await page.evaluate(() => ({
        canvasFrames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
        framePointerEvents: getComputedStyle(document.querySelector('.jpdb-ocr-canvas-frame') || document.body).pointerEvents,
        frameOpacity: getComputedStyle(document.querySelector('.jpdb-ocr-canvas-frame') || document.body).opacity,
        ocrLayers: document.querySelectorAll('.jpdb-ocr-layer').length,
        ocrLines: document.querySelectorAll('.jpdb-ocr-line').length,
        ocrText: Array.from(document.querySelectorAll('.jpdb-ocr-line')).map(l => l.dataset.ocrText).filter(Boolean),
    }));
    console.log('[bookwalker]', JSON.stringify(b), 'ocrRequests=', JSON.stringify(ocrRequests), 'errors=', errors.slice(0, 3));
    pass('bookwalker: canvas snapshot frame created', b.canvasFrames >= 1);
    pass('bookwalker: snapshot is pointer-transparent (host paging works)', b.framePointerEvents === 'none');
    pass('bookwalker: snapshot is visually invisible (no double-render)', Number(b.frameOpacity) === 0);
    pass('bookwalker: OCR request fired for canvas', ocrRequests.some(r => r.provider === 'local-service'));
    pass('bookwalker: OCR overlay rendered over canvas', b.ocrLines >= 1, b.ocrText.join(' / '));
    await page.screenshot({ path: '/tmp/yomu-recon/verify-bookwalker.png' });

    // Page turn -> re-snapshot
    const before = ocrRequests.length;
    await page.click('#next');
    await page.waitForTimeout(3500);
    pass('bookwalker: page turn triggers re-snapshot', ocrRequests.length > before, `${before} -> ${ocrRequests.length}`);
    await context.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES: ${failures.join('; ')}` : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
