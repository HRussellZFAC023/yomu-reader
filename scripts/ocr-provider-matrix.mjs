#!/usr/bin/env node
// Verify every OCR provider end to end (iPad emulation) on a canvas page with
// real Japanese text painted on it:
//   - local-service : mocked HTTP endpoint -> overlay renders mock text
//   - cloud-vision  : mocked vision.googleapis.com -> overlay + correct request shape
//   - google-lens   : REAL network call to Google Lens -> overlay with real OCR
// The GM HTTP bridge handler runs in Node: it mocks the configurable endpoints
// and performs a real fetch (no CORS) for Google Lens, returning raw bytes.
// The canvas page is the synthetic BookWalker viewer served at the real viewer
// host, because that host is what makes a text-free canvas page an automatic
// image-OCR page (shouldAutoScanImageOcr).
// The same page served at an ordinary host is a generic canvas reader with no
// Japanese DOM text, which image OCR does not auto-scan. There the learner's own
// local service still reads it by itself, while a cloud provider receives nothing
// until a tap and the site shows the one-time "Tap the page to read it" hint.
// With a mouse, pointing at that page sends nothing either: only a click reads it.
// The hint's dismiss button takes a 44px finger or a 24px mouse press.
import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY, gmRequestFetchBody } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga']
    .map(name => path.join(DIST, 'greasyfork', `${name}.user.js`));
const BW_FIXTURE_HTML = readFileSync(new URL('./fixtures/bookwalker-viewer.html', import.meta.url));
const BW_VIEWER_URL = 'https://viewer.bookwalker.jp/de_ocr-provider-matrix/';
const GENERIC_READER_URL = 'https://manga-reader.example/ocr-provider-matrix/';
const TAP_HINT = '.jpdb-ocr-canvas-tap-hint:not([hidden])';
// Long enough for boot, the canvas gate and several scroll/mutation passes: a
// cloud provider must still have received nothing when it ends.
const BACKGROUND_SETTLE_MS = 3_000;
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
const desktop = devices['Desktop Chrome'];
const browser = await chromium.launch({ headless: true });

async function openReaderPage({ url, settings, real, device = ipad }) {
    const context = await browser.newContext({ ...device, locale: 'en-US', bypassCSP: true });
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
    await context.route(url, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BW_FIXTURE_HTML }));
    const load = async () => {
        await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
        for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    };
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await load();
    const reload = async () => {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await load();
    };
    return { context, page, requests, reload };
}

async function readOcrResult(page, { label, requests, expectUrl, real }) {
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
}

async function runProvider({ label, settings, expectUrl, real }) {
    const { context, page, requests } = await openReaderPage({ url: BW_VIEWER_URL, settings, real });
    await readOcrResult(page, { label, requests, expectUrl, real });
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}.png` });
    await context.close();
}

async function tapHintState(page) {
    return page.evaluate(selector => {
        const hint = document.querySelector(selector);
        const box = element => element?.getBoundingClientRect().toJSON() ?? null;
        const overlaps = (a, b) => Boolean(a && b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const hintBox = box(hint);
        const controls = Array.from(document.querySelectorAll('#toolbar button')).map(box);
        return {
            text: hint?.textContent ?? '',
            canvasFrames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
            scanningPills: document.querySelectorAll('.jpdb-ocr-video-frame-status:not(.jpdb-ocr-canvas-tap-hint)').length,
            coversControl: controls.some(control => overlaps(hintBox, control)),
            insideCanvas: overlaps(hintBox, box(document.querySelector('canvas.default'))),
        };
    }, TAP_HINT);
}

// The pill is dark in every theme, so its label and dismiss "×" carry light ink
// (text and fill colour) rather than the theme's text colour.
async function tapHintInk(page) {
    return page.evaluate(selector => {
        const ink = [...document.querySelectorAll(`${selector} :is(.jpdb-ocr-video-frame-status-label, .jpdb-ocr-canvas-tap-hint-dismiss)`)]
            .map(element => `${getComputedStyle(element).color} / ${getComputedStyle(element).webkitTextFillColor}`);
        return { ink: ink.join(', '), light: ink.length === 2 && ink.every(colours => colours === 'rgb(245, 247, 255) / rgb(245, 247, 255)') };
    }, TAP_HINT);
}

// How far around its glyph the hint's dismiss button still takes a press.
async function dismissTargetSize(page) {
    return page.evaluate(selector => {
        const button = document.querySelector(`${selector} .jpdb-ocr-canvas-tap-hint-dismiss`);
        if (!button) return { width: 0, height: 0 };
        const box = button.getBoundingClientRect();
        const centreX = box.left + box.width / 2;
        const centreY = box.top + box.height / 2;
        const reach = (dx, dy) => {
            let distance = 0;
            while (distance < 40 && document.elementFromPoint(centreX + dx * (distance + 1), centreY + dy * (distance + 1)) === button) distance++;
            return distance;
        };
        return { glyph: Math.round(box.width), width: reach(-1, 0) + reach(1, 0) + 1, height: reach(0, -1) + reach(0, 1) + 1 };
    }, TAP_HINT);
}

// Outside BookWalker: the learner's own service reads the canvas page by itself.
async function runGenericLocalService({ label, settings, expectUrl }) {
    const { context, page, requests } = await openReaderPage({ url: GENERIC_READER_URL, settings });
    await readOcrResult(page, { label, requests, expectUrl });
    pass(`${label}: no tap hint for the learner's own OCR service`, await page.locator(TAP_HINT).count() === 0);
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}.png` });
    await context.close();
}

// Outside BookWalker: a cloud provider receives nothing until the tap, the
// one-time hint says so without covering the reader's controls, and a reload of
// the same site does not show it again.
async function runGenericCloudProvider({ label, settings, expectUrl, real }) {
    const { context, page, requests, reload } = await openReaderPage({ url: GENERIC_READER_URL, settings, real });
    const hintShown = await page.waitForSelector(TAP_HINT, { timeout: MOCK_RESULT_TIMEOUT_MS }).then(() => true, () => false);
    await page.waitForTimeout(BACKGROUND_SETTLE_MS);
    const before = await tapHintState(page);
    console.log(`\n[${label}] before tap: ${JSON.stringify(before)} reqs=${requests.length}`);
    pass(`${label}: tap hint shown`, hintShown && before.text.includes('Tap the page to read it'), before.text);
    pass(`${label}: nothing sent before the tap`, !requests.some(u => expectUrl.test(u)), requests.join(' ').slice(0, 120));
    pass(`${label}: nothing captured before the tap`, before.canvasFrames === 0 && before.scanningPills === 0);
    pass(`${label}: hint sits on the page, clear of the reader's controls`, before.insideCanvas && !before.coversControl);
    const ink = await tapHintInk(page);
    pass(`${label}: label and dismiss "×" carry the pill's light ink`, ink.light, ink.ink);
    const target = await dismissTargetSize(page);
    pass(`${label}: a finger-sized dismiss target around the same glyph`, target.width >= 44 && target.height >= 44 && target.glyph === 20, JSON.stringify(target));
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}-hint.png` });

    await page.tap('canvas.default');
    await readOcrResult(page, { label, requests, expectUrl, real });
    pass(`${label}: the tap retires the hint`, await page.locator('.jpdb-ocr-canvas-tap-hint').count() === 0);
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}.png` });

    const sentBeforeReload = requests.length;
    await reload();
    await page.waitForTimeout(BACKGROUND_SETTLE_MS);
    const remembered = await page.evaluate(() => Object.keys(localStorage).some(key => key.includes('ocr-canvas-tap-hint-seen')));
    pass(`${label}: the site remembers the hint was shown`, remembered);
    pass(`${label}: hint stays dismissed on this site after a reload`, await page.locator('.jpdb-ocr-canvas-tap-hint').count() === 0);
    pass(`${label}: nothing sent in the background after a reload`, !requests.slice(sentBeforeReload).some(u => expectUrl.test(u)));
    await context.close();
}

// Outside BookWalker with a mouse: a cloud provider receives nothing while the
// pointer crosses the page, the hint stays up, and only a click reads the page.
async function runGenericCloudProviderWithMouse({ label, settings, expectUrl, real }) {
    const { context, page, requests } = await openReaderPage({ url: GENERIC_READER_URL, settings, real, device: desktop });
    const hintShown = await page.waitForSelector(TAP_HINT, { timeout: MOCK_RESULT_TIMEOUT_MS }).then(() => true, () => false);
    const canvas = await page.locator('canvas.default').boundingBox();
    // The page is taller than a desktop viewport: cross the part on screen.
    const onScreenHeight = Math.min(canvas.height, page.viewportSize().height - canvas.y);
    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        await page.mouse.move(canvas.x + canvas.width * fraction, canvas.y + onScreenHeight * fraction, { steps: 6 });
    }
    await page.waitForTimeout(BACKGROUND_SETTLE_MS);
    const target = await dismissTargetSize(page);
    console.log(`\n[${label}] after pointing: hint=${await page.locator(TAP_HINT).count()} target=${JSON.stringify(target)} reqs=${requests.length}`);
    pass(`${label}: tap hint shown`, hintShown);
    pass(`${label}: pointing at the page sends nothing`, !requests.some(u => expectUrl.test(u)), requests.join(' ').slice(0, 120));
    pass(`${label}: pointing leaves the hint up`, await page.locator(TAP_HINT).count() === 1);
    pass(`${label}: a mouse-sized dismiss target around the same glyph`, target.width >= 24 && target.height >= 24 && target.glyph === 20, JSON.stringify(target));

    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + onScreenHeight / 2);
    await readOcrResult(page, { label, requests, expectUrl, real });
    pass(`${label}: the click retires the hint`, await page.locator('.jpdb-ocr-canvas-tap-hint').count() === 0);
    await page.screenshot({ path: `/tmp/yomu-recon/ocr-${label}.png` });
    await context.close();
}

const base = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: true };

await runProvider({ label: 'local-service', expectUrl: /127\.0\.0\.1:7331\/ocr/, settings: { ...base, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' } });
await runProvider({ label: 'cloud-vision', expectUrl: /vision\.googleapis\.com.*key=test-key/, settings: { ...base, ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: 'test-key' } });
await runProvider({ label: 'google-lens', real: LENS_REAL, expectUrl: /lensfrontend-pa\.googleapis\.com|lens\.google\.com/, settings: { ...base, ocrProvider: 'google-lens' } });

await runGenericLocalService({ label: 'generic-canvas-local-service', expectUrl: /127\.0\.0\.1:7331\/ocr/, settings: { ...base, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' } });
await runGenericCloudProvider({ label: 'generic-canvas-cloud-vision', expectUrl: /vision\.googleapis\.com.*key=test-key/, settings: { ...base, ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: 'test-key' } });
// The light theme's text colour is dark: the pill must not inherit it.
await runGenericCloudProvider({ label: 'generic-canvas-cloud-vision-light', expectUrl: /vision\.googleapis\.com.*key=test-key/, settings: { ...base, theme: 'light', ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: 'test-key' } });
await runGenericCloudProvider({ label: 'generic-canvas-google-lens', real: LENS_REAL, expectUrl: /lensfrontend-pa\.googleapis\.com|lens\.google\.com/, settings: { ...base, ocrProvider: 'google-lens' } });
await runGenericCloudProviderWithMouse({ label: 'generic-canvas-cloud-vision-mouse', expectUrl: /vision\.googleapis\.com.*key=test-key/, settings: { ...base, ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: 'test-key' } });
await runGenericCloudProviderWithMouse({ label: 'generic-canvas-google-lens-mouse', real: LENS_REAL, expectUrl: /lensfrontend-pa\.googleapis\.com|lens\.google\.com/, settings: { ...base, ocrProvider: 'google-lens' } });

await browser.close();
console.log(failures.length ? `\nFAILURES: ${failures.join('; ')}` : '\nALL PROVIDERS PASS');
process.exit(failures.length ? 1 : 0);
