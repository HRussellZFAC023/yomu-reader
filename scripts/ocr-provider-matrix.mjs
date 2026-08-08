#!/usr/bin/env node
// Verify every OCR provider end to end (iPad emulation) on a canvas page with
// real Japanese text painted on it:
//   - local-service : mocked HTTP endpoint -> overlay renders mock text
//   - cloud-vision  : mocked vision.googleapis.com -> overlay + correct request shape
//   - google-lens   : REAL network call to Google Lens -> overlay with real OCR
// The GM HTTP bridge handler runs in Node: it mocks the configurable endpoints
// and performs a real fetch (no CORS) for Google Lens, returning raw bytes.
import { chromium, devices } from 'playwright';
import path from 'node:path';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY, gmRequestFetchBody } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga']
    .map(name => path.join(DIST, 'greasyfork', `${name}.user.js`));
const BW_FIXTURE = 'file://' + new URL('./fixtures/bookwalker-viewer.html', import.meta.url).pathname;
const BRIDGE = '__yomuOcrMatrixRequest';
const LENS_REAL = process.env.LENS_REAL !== '0';
const HAS_JP = /[぀-ヿ㐀-鿿]/;
const MOCK_RESULT_TIMEOUT_MS = 9_000;
// The production provider spends one 30s attempt budget across protobuf and
// upload transports (src/reader/ocr/ocr-shared.ts). Leave startup/paint
// headroom around that budget: a fixed 14s snapshot used to close the page
// while the protobuf request was still pending, before the upload fallback.
const LENS_RESULT_TIMEOUT_MS = 35_000;

const MOCK_OCR = { width: 800, height: 1130, lines: [
    { text: 'プロバイダーのOCRテスト', box: { x: 60, y: 120, w: 600, h: 60 }, vertical: false },
    { text: '大変な事です', box: { x: 60, y: 300, w: 360, h: 60 }, vertical: false },
] };

const failures = [];
const pass = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failures.push(name); };

const ipad = devices['iPad Pro 11'];
const browser = await chromium.launch({ headless: true });

async function runProvider({ label, settings, expectUrl, real }) {
    const context = await browser.newContext({ ...ipad, locale: 'en-US', bypassCSP: true });
    const page = await context.newPage();
    const requests = [];
    await page.exposeFunction(BRIDGE, async request => {
        const url = request.url || '';
        requests.push(url);
        if (/vision\.googleapis\.com/.test(url)) return { status: 200, responseText: JSON.stringify(MOCK_OCR) };
        if (/127\.0\.0\.1:7331|\/ocr(\?|$)/.test(url)) return { status: 200, responseText: JSON.stringify(MOCK_OCR) };
        if (real && /lensfrontend-pa\.googleapis\.com|lens\.google\.com/.test(url)) {
            try {
                const res = await fetch(url, { method: request.method || 'POST', headers: request.headers || {}, body: gmRequestFetchBody(request) });
                const buf = Buffer.from(await res.arrayBuffer());
                return { status: res.status, bytes: [...new Uint8Array(buf)], responseText: '' };
            } catch (e) { return { status: 0, responseText: String(e).slice(0, 80) }; }
        }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings, requestBridgeName: BRIDGE });
    await page.goto(BW_FIXTURE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    const resultTimeoutMs = real ? LENS_RESULT_TIMEOUT_MS : MOCK_RESULT_TIMEOUT_MS;
    const resultStartedAt = Date.now();
    await page.waitForFunction(
        () => document.querySelectorAll('.jpdb-ocr-line').length > 0,
        undefined,
        { timeout: resultTimeoutMs },
    ).catch(() => {});
    const r = await page.evaluate(() => ({
        canvasFrames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
        ocrLines: document.querySelectorAll('.jpdb-ocr-line').length,
        text: Array.from(document.querySelectorAll('.jpdb-ocr-line')).map(l => l.dataset.ocrText).filter(Boolean),
    }));
    const hitExpected = requests.some(u => expectUrl.test(u));
    console.log(`\n[${label}] frames=${r.canvasFrames} lines=${r.ocrLines} text=${JSON.stringify(r.text.slice(0, 4))} reqs=${requests.length} wait=${Date.now() - resultStartedAt}ms/${resultTimeoutMs}ms`);
    pass(`${label}: request hit ${expectUrl}`, hitExpected, requests.find(u => expectUrl.test(u))?.slice(0, 70));
    pass(`${label}: OCR overlay rendered`, r.ocrLines >= 1);
    pass(`${label}: overlay text is Japanese`, r.text.some(t => HAS_JP.test(t)), r.text[0] || '(none)');
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}.png` });
    await context.close();
}

const base = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: true };

await runProvider({ label: 'local-service', expectUrl: /127\.0\.0\.1:7331\/ocr/, settings: { ...base, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' } });
await runProvider({ label: 'cloud-vision', expectUrl: /vision\.googleapis\.com.*key=test-key/, settings: { ...base, ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: 'test-key' } });
await runProvider({ label: 'google-lens', real: LENS_REAL, expectUrl: /lensfrontend-pa\.googleapis\.com|lens\.google\.com/, settings: { ...base, ocrProvider: 'google-lens' } });

await browser.close();
console.log(failures.length ? `\nFAILURES: ${failures.join('; ')}` : '\nALL PROVIDERS PASS');
process.exit(failures.length ? 1 : 0);
