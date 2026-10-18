#!/usr/bin/env node
// Honest OCR: a failed provider call is a failure the learner sees, never a
// remembered "no text", and one image costs one Google Lens request.
//
// Drives the BUILT product (dist/yomu.user.js, its @require companions and
// @resource CSS) on recorded Wikimedia Commons file pages in Chromium and
// WebKit. Google Lens answers from a real Lens answer recorded for each photo
// (scripts/fixtures/ocr/, captured with --capture-lens), so every run is
// offline and deterministic.
//
//   honesty   the first crupload answers 429: tap 1 shows a failed mark within
//             300 ms, the pointer passing over the photo again sends nothing,
//             tap 2 reads the lines, 2 Lens requests in total; after a reload
//             a tap renders from Yomu's private cache with 0 requests.
//   loading   Lens answers after 2.5 s: a loading mark is over the photo at 300 ms.
//   hover     the pointer only passes over the photo, never presses: no mark
//             (loading, failed or no text) ever shows, whether Lens is slow and
//             refuses or answers with no text; a press then reads the photo.
//   decode    the photo is tapped while it loads and its bytes arrive 1.5 s
//             later: exactly 1 crupload, with the real JPEG (> 20 KB), never a
//             blank one sent before it decoded, and the tap is not dropped.
//   photo     defaults, one tap on a photo with dark regions opened on its
//             own: exactly 1 crupload (no inverted second pass) and every
//             recorded line.
//
// Every case also checks that nothing reached lens.google.com or
// www.google.com, and that the page's own localStorage holds no OCR cache.
//
//   node scripts/ocr-honesty-smoke.mjs [cases] [--engines=chromium,webkit] [--product=v2.1.6]
//   node scripts/ocr-honesty-smoke.mjs --capture-lens=sign|sushi   # record a Lens answer again (live)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';
import { gmRequestFetchBody } from './lib/smoke-harness.mjs';

const ANSWERS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ocr');
// lines: what the live answer rendered when it was captured (--capture-lens prints it).
const TARGETS = {
    // CC0 street sign; its <img> links to the full-size file.
    sign: { slug: 'commons-sign-photo', photo: 'img[data-file-width="4032"][width="800"]', photoUrl: /\/960px-.*%E7%9C%8B%E6%9D%BF\.jpg/u, lines: 5 },
    // CC BY 4.0 sushi bar signboard with dark regions. The photo case opens the
    // photo itself (the file page's link target), as a standalone image
    // document: same-origin pixels, so 2.1.6 also measured its dark regions
    // and read it a second time, inverted.
    sushi: {
        slug: 'commons-sushi-photo',
        photo: 'img[data-file-width="3060"][width="450"]',
        documentUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/Tachiguisushi-Uogashi-Yamaharu---2025-08-15_017.jpg/500px-Tachiguisushi-Uogashi-Yamaharu---2025-08-15_017.jpg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail&_=20251015180525',
        lines: 10,
    },
};
const LENS = /lensfrontend-pa\.googleapis\.com\/v1\/crupload/u;
const GOOGLE_WEB = /^https?:\/\/(lens\.google\.com|www\.google\.com)\//u;
// What Google answers the retired lens.google.com/v3/upload form with today: a
// consent wall or a page that needs JavaScript, never OCR data.
const GOOGLE_CONSENT_PAGE = '<!doctype html><title>Before you continue to Google</title><form action="https://consent.google.com/save"></form>';
const FAILED_MARK_BUDGET_MS = 300;
const HOVER_REENTRIES = 6;
// GM storage lives apart from the page's own keys, as in a real manager.
const GM_STORAGE_PREFIX = '__yomu-gm-storage__:';
const ENGINES = { chromium, webkit };

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const cases = args.filter(arg => !arg.startsWith('--'));
const runCase = name => !cases.length || cases.includes(name);
const engines = (option('engines') ?? 'chromium,webkit').split(',');
const productRef = option('product');
const product = productRef ? releaseProduct(productRef) : worktreeProduct();
const failures = [];

const check = (label, condition, detail) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    if (!condition) failures.push(label);
};

if (option('capture-lens')) {
    await captureLensAnswer(TARGETS[option('capture-lens')]);
    process.exit(0);
}
for (const target of Object.values(TARGETS)) target.answer = readLensAnswer(target);

for (const engine of engines) {
    const browser = await ENGINES[engine].launch();
    try {
        if (runCase('honesty')) await honestyCase(browser, engine);
        if (runCase('loading')) await loadingCase(browser, engine);
        if (runCase('hover')) await hoverCase(browser, engine);
        if (runCase('decode')) await decodeCase(browser, engine);
        if (runCase('photo')) await photoCase(browser, engine);
    } finally {
        await browser.close();
    }
}

if (failures.length) {
    console.error(`\n[ocr-honesty] ${failures.length} failure(s) on ${product.label}`);
    process.exit(1);
}
console.log(`\n[ocr-honesty] all checks passed on ${product.label}`);

// --- cases -------------------------------------------------------------------

async function honestyCase(browser, engine) {
    const label = `${engine} honesty`;
    const target = TARGETS.sign;
    let lensCalls = 0;
    let refusedAt = 0;
    const run = await openPhotoPage(browser, target, {
        // Taps only: an automatic scan would spend the 429 before the first tap.
        settings: tapOnlySettings(),
        onGmRequest: request => {
            if (!LENS.test(request.url)) return googleWebAnswer(request);
            lensCalls += 1;
            if (lensCalls > 1) return lensProtobuf(target);
            refusedAt = Date.now();
            return { status: 429, contentType: 'text/plain', body: 'Too Many Requests' };
        },
    });
    try {
        await tapPhoto(run.page, target);
        const failedAt = await waitForMark(run.page, target, 'failed', 8_000);
        check(`${label}: tap 1 shows the failed mark within ${FAILED_MARK_BUDGET_MS} ms of the 429`,
            failedAt > 0 && refusedAt > 0 && failedAt - refusedAt <= FAILED_MARK_BUDGET_MS,
            { afterRefusalMs: failedAt && refusedAt ? failedAt - refusedAt : null, lines: await lineCount(run.page) });
        // Only a press or the failed mark reads a failed image again; a hover
        // per pass would hammer the rate limit that refused it.
        const beforeHover = lensCalls;
        await hoverInAndOut(run.page, target, HOVER_REENTRIES);
        check(`${label}: ${HOVER_REENTRIES} pointer passes over the failed photo send 0 Lens requests`, lensCalls === beforeHover, { newRequests: lensCalls - beforeHover });
        await tapPhoto(run.page, target);
        const lines = await waitForLines(run.page, 10_000);
        check(`${label}: tap 2 reads the photo`, lines === target.lines, { lines });
        check(`${label}: 2 Lens requests in total`, lensCalls === 2, { lensCalls });

        // The answer outlives the page in Yomu's own storage, not the site's.
        await run.page.waitForTimeout(1_500);
        await run.page.reload({ waitUntil: 'load' });
        await run.page.locator(target.photo).waitFor({ state: 'visible' });
        await run.page.waitForTimeout(1_500);
        const beforeReloadTap = lensCalls;
        await tapPhoto(run.page, target);
        const cachedLines = await waitForLines(run.page, 8_000);
        check(`${label}: after a reload a tap renders from the cache`, cachedLines === target.lines, { lines: cachedLines });
        check(`${label}: ... with 0 new Lens requests`, lensCalls === beforeReloadTap, { newRequests: lensCalls - beforeReloadTap });
        await checkPrivacy(run, label);
    } finally {
        await run.close();
    }
}

async function loadingCase(browser, engine) {
    const label = `${engine} loading`;
    const target = TARGETS.sign;
    const run = await openPhotoPage(browser, target, {
        settings: tapOnlySettings(),
        onGmRequest: async request => {
            if (!LENS.test(request.url)) return googleWebAnswer(request);
            await delay(2_500);
            return lensProtobuf(target);
        },
    });
    try {
        await tapPhoto(run.page, target);
        await run.page.waitForTimeout(300);
        const mark = await markOverPhoto(run.page, target);
        check(`${label}: a loading mark is over the photo 300 ms after the click`, mark?.status === 'loading' && mark.visible && mark.over, mark);
        const lines = await waitForLines(run.page, 10_000);
        check(`${label}: the lines render when Lens answers`, lines === target.lines, { lines });
        await checkPrivacy(run, label);
    } finally {
        await run.close();
    }
}

// A pointer passing over a photo is not a press: whatever a read it starts
// does, it stays as quiet as an automatic scan.
async function hoverCase(browser, engine) {
    const label = `${engine} hover`;
    const target = TARGETS.sign;
    let lensCalls = 0;
    const slowRefusal = await openPhotoPage(browser, target, {
        settings: tapOnlySettings(),
        onGmRequest: async request => {
            if (!LENS.test(request.url)) return googleWebAnswer(request);
            lensCalls += 1;
            if (lensCalls > 1) return lensProtobuf(target);
            await delay(1_500);
            return { status: 429, contentType: 'text/plain', body: 'Too Many Requests' };
        },
    });
    try {
        const box = await slowRefusal.page.locator(target.photo).boundingBox();
        const seen = await marksSeenWhile(slowRefusal.page, target, async () => {
            await slowRefusal.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
            await slowRefusal.page.waitForTimeout(2_500);
            await slowRefusal.page.mouse.move(Math.max(2, box.x - 40), Math.max(2, box.y - 40), { steps: 3 });
            await slowRefusal.page.waitForTimeout(1_500);
        });
        check(`${label}: a slow, refused read started by the pointer shows no mark`, seen.length === 0, { marks: seen, lensCalls });
        await tapPhoto(slowRefusal.page, target);
        const lines = await waitForLines(slowRefusal.page, 10_000);
        check(`${label}: a press then reads the photo`, lines === target.lines, { lines });
    } finally {
        await slowRefusal.close();
    }

    const noText = await openPhotoPage(browser, target, {
        settings: { onboardingSeen: true, interfaceLanguage: 'en' },
        onGmRequest: request => (LENS.test(request.url)
            ? { status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) }
            : googleWebAnswer(request)),
    });
    try {
        await noText.page.waitForTimeout(2_000);
        const seen = await marksSeenWhile(noText.page, target, () => hoverInAndOut(noText.page, target, 3));
        check(`${label}: 3 pointer passes over a photo with no text show no mark (defaults)`, seen.length === 0, { marks: seen });
        await checkPrivacy(noText, label);
    } finally {
        await noText.close();
    }
}

/** Every mark status seen over the photo while `action` runs, polled each frame. */
async function marksSeenWhile(page, target, action) {
    const seen = new Set();
    let running = true;
    const poll = (async () => {
        while (running) {
            const mark = await markOverPhoto(page, target).catch(() => null);
            if (mark?.visible) seen.add(mark.status);
            await delay(16);
        }
    })();
    try {
        await action();
    } finally {
        running = false;
        await poll;
    }
    return [...seen];
}

async function decodeCase(browser, engine) {
    const label = `${engine} decode`;
    const target = TARGETS.sign;
    const run = await openPhotoPage(browser, target, {
        settings: null,
        navigate: false,
        onGmRequest: request => (LENS.test(request.url) ? lensProtobuf(target) : googleWebAnswer(request)),
    });
    try {
        // The photo's bytes are held until 1.5 s after the tap: the <img> has its
        // layout box (width and height attributes) but nothing decoded yet.
        let tapped;
        const tappedSignal = new Promise(resolve => { tapped = resolve; });
        await run.page.route(target.photoUrl, async route => {
            await Promise.race([tappedSignal, delay(10_000)]);
            await delay(1_500);
            await route.fallback();
        });
        await run.page.goto(run.recording.manifest.url, { waitUntil: 'domcontentloaded' });
        await run.page.locator(target.photo).waitFor({ state: 'visible' });
        await run.page.waitForTimeout(400);
        const loadingAtTap = await run.page.locator(target.photo).evaluate(image => !image.complete || !image.naturalWidth);
        // A tap on a photo that is still loading is kept until it decodes, not dropped.
        await tapPhoto(run.page, target);
        tapped();
        const lines = await waitForLines(run.page, 12_000);
        await run.page.waitForTimeout(3_000);
        const uploads = lensRequests(run);
        check(`${label}: the tap landed while the photo was still loading`, loadingAtTap);
        check(`${label}: exactly 1 crupload for a photo that loaded late`, uploads.length === 1, uploads.map(entry => entry.bodyBytes));
        check(`${label}: the crupload carries the decoded photo (> 20 KB)`, uploads.length > 0 && uploads.every(entry => entry.bodyBytes > 20_000), uploads.map(entry => entry.bodyBytes));
        check(`${label}: the tap made while it loaded reads the photo`, lines === target.lines, { lines });
        await checkPrivacy(run, label);
    } finally {
        await run.close();
    }
}

async function photoCase(browser, engine) {
    const label = `${engine} photo`;
    const target = TARGETS.sushi;
    const run = await openPhotoPage(browser, target, {
        settings: null,
        navigate: false,
        onGmRequest: request => (LENS.test(request.url) ? lensProtobuf(target) : googleWebAnswer(request)),
    });
    try {
        await run.page.goto(target.documentUrl, { waitUntil: 'load' });
        const standalone = { photo: 'body > img' };
        await run.page.locator(standalone.photo).waitFor({ state: 'visible' });
        await run.page.waitForTimeout(1_000);
        await tapPhoto(run.page, standalone);
        await waitForLines(run.page, 10_000);
        // Time for a second, inverted pass to be sent if one were coming.
        await run.page.waitForTimeout(5_000);
        const uploads = lensRequests(run);
        const lines = await lineCount(run.page);
        check(`${label}: exactly 1 crupload with default settings`, uploads.length === 1, { cruploads: uploads.length });
        check(`${label}: all ${target.lines} recorded lines render`, lines === target.lines, { lines, expected: target.lines });
        await checkPrivacy(run, label);
    } finally {
        await run.close();
    }
}

// --- shared ------------------------------------------------------------------

function tapOnlySettings() {
    return { onboardingSeen: true, interfaceLanguage: 'en', ocrAutoScanImages: false };
}

async function openPhotoPage(browser, target, { settings, onGmRequest, navigate = true }) {
    const run = await openRecordedPage({ browser, slug: target.slug, product, settings, onGmRequest, navigate: false, gmStoragePrefix: GM_STORAGE_PREFIX });
    // The photo is a link to the full-size file. A tap here reads it and stays
    // on the page, so the link's navigation is cancelled (the product's own
    // pointer handlers still see every event).
    await run.context.addInitScript(() => {
        document.addEventListener('click', event => {
            if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
        }, true);
    });
    if (navigate) {
        await run.page.goto(run.recording.manifest.url, { waitUntil: 'load' });
        await run.page.locator(target.photo).waitFor({ state: 'visible' });
    }
    return run;
}

function answerPath(target) {
    return path.join(ANSWERS_DIR, `${target.slug}.lens-crupload.pb`);
}

function readLensAnswer(target) {
    const file = answerPath(target);
    if (!existsSync(file)) throw new Error(`No recorded Lens answer at ${file}. Run node scripts/ocr-honesty-smoke.mjs --capture-lens=…`);
    return readFileSync(file);
}

function lensProtobuf(target) {
    return { status: 200, contentType: 'application/x-protobuf', body: target.answer };
}

// Anything to Google's web hosts is a failure the privacy check reports; it
// gets what Google sends today so an old build behaves as it does for learners.
function googleWebAnswer(request) {
    return GOOGLE_WEB.test(request.url) ? { status: 200, contentType: 'text/html; charset=utf-8', body: GOOGLE_CONSENT_PAGE } : undefined;
}

function lensRequests(run) {
    return run.ledger.requests({ host: 'lensfrontend-pa.googleapis.com', channel: 'gm' });
}

async function tapPhoto(page, target) {
    const box = await page.locator(target.photo).boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
}

async function hoverInAndOut(page, target, times) {
    const box = await page.locator(target.photo).boundingBox();
    for (let pass = 0; pass < times; pass += 1) {
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
        await page.waitForTimeout(400);
        await page.mouse.move(Math.max(2, box.x - 40), Math.max(2, box.y - 40), { steps: 3 });
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1_000);
}

async function waitForMark(page, target, status, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const mark = await markOverPhoto(page, target);
        if (mark?.status === status && mark.visible) return Date.now();
        await delay(16);
    }
    return 0;
}

function markOverPhoto(page, target) {
    return page.evaluate(selector => {
        const photo = document.querySelector(selector)?.getBoundingClientRect();
        const marks = [...document.querySelectorAll('.jpdb-ocr-video-frame-status:not(.jpdb-ocr-canvas-tap-hint)')];
        const mark = marks.find(node => node.dataset.status);
        if (!photo || !mark) return null;
        const rect = mark.getBoundingClientRect();
        const style = getComputedStyle(mark);
        const centreX = rect.left + rect.width / 2;
        const centreY = rect.top + rect.height / 2;
        return {
            status: mark.dataset.status,
            visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0,
            over: centreX >= photo.left && centreX <= photo.right && centreY >= photo.top && centreY <= photo.bottom,
        };
    }, target.photo);
}

function lineCount(page) {
    return page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line').length);
}

async function waitForLines(page, timeoutMs) {
    try {
        await page.waitForFunction(() => document.querySelectorAll('.jpdb-ocr-line').length > 0, null, { timeout: timeoutMs });
    } catch {
        // Reported by the caller's check.
    }
    return lineCount(page);
}

async function checkPrivacy(run, label) {
    const googleWeb = run.ledger.requests({}).filter(entry => GOOGLE_WEB.test(entry.url));
    check(`${label}: nothing sent to lens.google.com or www.google.com`, googleWeb.length === 0, googleWeb.map(entry => entry.url.slice(0, 60)));
    const pageKeys = await run.page.evaluate(prefix => Object.keys(localStorage)
        .filter(key => !key.startsWith(prefix) && key.includes('ocr-cache')), GM_STORAGE_PREFIX);
    check(`${label}: the page's own localStorage holds no OCR cache`, pageKeys.length === 0, pageKeys);
}

async function captureLensAnswer(target) {
    if (!target) throw new Error(`--capture-lens takes one of ${Object.keys(TARGETS).join(', ')}`);
    const browser = await chromium.launch();
    let saved = false;
    try {
        const run = await openPhotoPage(browser, target, {
            // One normal pass: the answer for the photo as the learner sees it.
            settings: { ...tapOnlySettings(), ocrInvertDarkPanels: false },
            onGmRequest: async request => {
                if (!LENS.test(request.url)) return googleWebAnswer(request);
                const response = await fetch(request.url, { method: 'POST', headers: request.headers ?? {}, body: gmRequestFetchBody(request) });
                const body = Buffer.from(await response.arrayBuffer());
                if (response.ok && !saved) {
                    mkdirSync(ANSWERS_DIR, { recursive: true });
                    writeFileSync(answerPath(target), body);
                    saved = true;
                }
                return { status: response.status, contentType: response.headers.get('content-type') ?? 'application/x-protobuf', body };
            },
        });
        await tapPhoto(run.page, target);
        const lines = await waitForLines(run.page, 30_000);
        await run.page.waitForTimeout(1_000);
        console.log(`[ocr-honesty] live Lens answer for ${target.slug}: ${await lineCount(run.page)} lines (first paint ${lines}); ${saved ? `saved ${answerPath(target)}` : 'NOT saved'}`);
        await run.close();
    } finally {
        await browser.close();
    }
    if (!saved) process.exit(1);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
