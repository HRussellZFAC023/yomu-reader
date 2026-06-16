#!/usr/bin/env node
// Verify the mokuro reader OCR gating + the loading-status card on all images.
//  - mokuro OCR OFF (displayOCR=false): the reader runs its OWN image OCR on the
//    manga page (loading status card appears, text overlay renders).
//  - mokuro OCR ON  (displayOCR=true): the reader defers to mokuro's native text
//    boxes and does NOT image-OCR the page.
import { chromium, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const FIXTURE = 'file:///tmp/mokuro-repro/mokuro-reader.html'; // path contains "mokuro" -> mokuro-parser matches
const BRIDGE = '__yomuMokuroSmokeRequest';
const MOCK_OCR = { width: 1080, height: 1530, lines: [
    { text: '羽海野チカの自動OCR', box: { x: 60, y: 120, w: 560, h: 70 }, vertical: false },
    { text: '大変な事になりました', box: { x: 60, y: 320, w: 470, h: 60 }, vertical: false },
] };

try { execFileSync('node', ['scripts/lib/build-mokuro-fixture.mjs'], { stdio: 'ignore', env: { ...process.env, MOKURO_INLINE_IMAGES: '1' } }); } catch {}

const failures = [];
const pass = (n, c, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}: ${n}${d ? ` — ${d}` : ''}`); if (!c) failures.push(n); };
const browser = await chromium.launch({ headless: true });

async function run(displayOcr) {
    const ctx = await browser.newContext({ ...devices['iPad Pro 11'], locale: 'en-US', bypassCSP: true });
    const page = await ctx.newPage();
    const ocrReqs = [];
    await page.exposeFunction(BRIDGE, async req => {
        const url = req.url || '';
        if (/127\.0\.0\.1:7331|\/ocr(\?|$)/.test(url)) { ocrReqs.push(url); return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        return { status: 503, responseText: '' };
    });
    // Seed mokuro's own setting the way reader.mokuro.app stores it.
    await page.addInitScript(([profiles, current]) => {
        try { localStorage.setItem('profiles', profiles); localStorage.setItem('currentProfile', current); } catch {}
    }, [JSON.stringify({ Mobile: { displayOCR: displayOcr } }), 'Mobile']);
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, requestBridgeName: BRIDGE, value: {
        onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false,
        ocrEnabled: true, ocrAutoScanImages: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
        ocrShowTextOverlay: true, ocrVideoFrameStatusCard: true, ocrMinImageArea: 15000,
    } });
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(9000);
    const r = await page.evaluate(() => ({
        ocrLayers: document.querySelectorAll('.jpdb-ocr-layer .jpdb-ocr-line').length,
        statusCards: document.querySelectorAll('.jpdb-ocr-video-frame-status').length,
        statusReadyOrLoading: Array.from(document.querySelectorAll('.jpdb-ocr-video-frame-status')).map(s => s.dataset.status),
        textBoxWords: document.querySelectorAll('.textBox .jpdb-reader-word').length,
    }));
    await page.screenshot({ path: `/tmp/yomu-recon/mokuro-gating-${displayOcr ? 'on' : 'off'}.png` });
    await ctx.close();
    return { ...r, ocrReqs: ocrReqs.length };
}

console.log('### mokuro OCR OFF (displayOCR=false) -> yomu OCRs the page ###');
const off = await run(false);
console.log(JSON.stringify(off));
pass('OCR-off: yomu image OCR ran (request fired)', off.ocrReqs > 0);
pass('OCR-off: OCR overlay rendered over the manga page', off.ocrLayers >= 1, `${off.ocrLayers} lines`);
pass('OCR-off: loading/ready status card shown on the image', off.statusCards >= 1, JSON.stringify(off.statusReadyOrLoading));

console.log('\n### mokuro OCR ON (displayOCR=true) -> defer to mokuro native text ###');
const on = await run(true);
console.log(JSON.stringify(on));
pass('OCR-on: native textBox words read', on.textBoxWords > 0, `${on.textBoxWords} words`);
pass('OCR-on: yomu did NOT image-OCR the page (deferred)', on.ocrReqs === 0 && on.ocrLayers === 0);

await browser.close();
console.log(failures.length ? `\nFAILURES: ${failures.join('; ')}` : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
