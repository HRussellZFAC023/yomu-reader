#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);
const NEWTAB_CSS_PATH = path.join(NEWTAB_DIR, 'styles.css');
const PAGE_PATH = '/pitch-underline.html';
const TARGET = '英会話';
const READING = 'えいかいわ';
const SENTENCE = `${TARGET}の練習をします。`;
const PITCH_COLOR = '#f59e0b';
const EXPECT_MODE = process.env.YOMU_PITCH_UNDERLINE_EXPECT === 'broken' ? 'broken' : 'fixed';
const SCREENSHOT_NAME = EXPECT_MODE === 'broken'
    ? 'pitch-underline-repro-before.png'
    : 'pitch-underline-fixed-real-pitch.png';
const WORD_SCREENSHOT_NAME = EXPECT_MODE === 'broken'
    ? 'pitch-underline-word-before.png'
    : 'pitch-underline-word-fixed.png';
const REPORT_NAME = EXPECT_MODE === 'broken'
    ? 'pitch-underline-repro-before.json'
    : 'pitch-underline-fixed-real-pitch.json';
const TARGET_RGB = hexToRgb(PITCH_COLOR);

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    accentColor: PITCH_COLOR,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'off',
    pitchColorHeiban: PITCH_COLOR,
    pitchColorAtamadaka: PITCH_COLOR,
    pitchColorNakadaka: PITCH_COLOR,
    pitchColorOdaka: PITCH_COLOR,
    pitchColorKifuku: PITCH_COLOR,
    pitchColorUnknown: '#94a3b8',
    corsProxyUrl: '',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, NEWTAB_CSS_PATH], ROOT, 'Run npm run build first.');

const requests = [];
const server = await startLoopbackServer(serveFixture, 'Could not bind pitch underline smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({
        bypassCSP: true,
        viewport: { width: 900, height: 520 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[console]', message.type(), message.text().slice(0, 240)));
        page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 240)));
    }

    await page.exposeFunction('__yomuPitchUnderlineSmokeRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuPitchUnderlineSmokeRequest',
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await page.addStyleTag({ path: NEWTAB_CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    const wordSelector = `.jpdb-reader-word[data-expression="${TARGET}"]`;
    await page.waitForFunction(selector => {
        const word = document.querySelector(selector);
        return word
            && word.classList.contains('jpdb-reader-has-furi')
            && word.querySelectorAll('ruby').length >= 2;
    }, wordSelector, { timeout: 15_000 });
    await page.waitForFunction(selector => {
        const word = document.querySelector(selector);
        return word
            && word.dataset.pitchClass
            && word.dataset.pitchClass !== 'unknown'
            && !word.classList.contains('jpdb-pitch-unknown');
    }, wordSelector, { timeout: 20_000 });
    await page.waitForTimeout(120);

    const pitchRequestCount = requests.filter(request => request.kind === 'jpdb-public-pitch').length;
    assert(pitchRequestCount > 0, 'Expected real JPDB public pitch lookup to be used.', { requests });

    const geometry = await wordGeometry(page, wordSelector);
    const rubyDecorations = await rubyDecorationInfo(page, wordSelector);
    const wordClip = paddedClip(geometry.rect, 22);
    const wordScreenshot = await page.screenshot({
        path: path.join(ARTIFACTS, WORD_SCREENSHOT_NAME),
        clip: wordClip,
    });
    const analysis = analyzeUnderline(wordScreenshot, {
        ...geometry,
        cropOffsetX: geometry.rect.x - wordClip.x,
    }, TARGET_RGB);
    const screenshotPath = path.join(ARTIFACTS, SCREENSHOT_NAME);
    await page.screenshot({ path: screenshotPath, clip: paddedClip(await fixtureClip(page)) });

    const fixed = analysis.largestInternalGap <= 2
        && analysis.coverage >= 0.92
        && geometry.textDecorationSkipInk === 'none'
        && !rubyDecorations.hasDecoratedChildren;
    const report = {
        ok: EXPECT_MODE === 'broken' ? !fixed : fixed,
        expect: EXPECT_MODE,
        fixed,
        target: TARGET,
        reading: READING,
        sentence: SENTENCE,
        pitchClass: geometry.pitchClass,
        pitchRequests: requests.filter(request => request.kind === 'jpdb-public-pitch').map(request => request.url),
        parseRequests: requests.filter(request => request.kind === 'jpdb-parse').length,
        screenshot: screenshotPath,
        wordScreenshot: path.join(ARTIFACTS, WORD_SCREENSHOT_NAME),
        underline: analysis,
        rubyDecorations,
        geometry,
    };
    writeFileSync(path.join(ARTIFACTS, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));

    if (EXPECT_MODE === 'broken') {
        assert(!fixed, 'Expected the current renderer to decorate ruby child fragments before the fix.', report);
    } else {
        assert(fixed, 'Pitch underline should be contiguous across the whole ruby word.', report);
    }
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

function serveFixture(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Yomu pitch underline smoke</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #18151b;
      color: #fff;
      font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif;
    }
    main {
      width: min(820px, calc(100vw - 48px));
      text-align: center;
      --jpdb-reader-accent: ${PITCH_COLOR};
      --jpdb-reader-accent-readable: ${PITCH_COLOR};
      --jpdb-reader-example-target-underline: ${PITCH_COLOR};
    }
    [data-pitch-scene] {
      position: relative;
      min-height: 250px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 10px;
      background:
        linear-gradient(180deg, rgba(15, 23, 42, .18), rgba(15, 23, 42, .84)),
        linear-gradient(135deg, #4c1d95 0%, #1e1b4b 42%, #111827 100%);
    }
    [data-pitch-scene]::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 22% 28%, rgba(251, 191, 36, .26), transparent 28%),
        radial-gradient(circle at 78% 18%, rgba(56, 189, 248, .24), transparent 24%),
        linear-gradient(160deg, rgba(255, 255, 255, .08), transparent 58%);
    }
    [data-pitch-sentence],
    [data-pitch-ocr-line] {
      position: relative;
      z-index: 1;
      margin: 0;
      font-size: 72px !important;
      font-weight: 900;
      line-height: 1.6 !important;
      letter-spacing: 0;
      text-shadow:
        0 1px 2px rgba(0, 0, 0, .72),
        0 0 8px rgba(0, 0, 0, .42);
    }
  </style>
</head>
<body>
  <main data-pitch-fixture class="jpdb-reader-newtab-immersion">
    <section data-pitch-scene class="jpdb-reader-example-card has-image">
      <p class="jpdb-reader-example-sentence jpdb-reader-parseable" data-pitch-sentence>${SENTENCE}</p>
    </section>
  </main>
</body>
</html>`);
}

async function handleYomuRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        requestsLog.push({ kind: 'jpdb-parse', url: request.url });
        return jsonHttpResponse(jpdbParseResponse());
    }
    if (url.origin === 'https://jpdb.io' && url.pathname === '/search') {
        requestsLog.push({ kind: 'jpdb-public-pitch', url: request.url });
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers ?? {},
        });
        return {
            status: response.status,
            responseText: await response.text(),
            contentType: response.headers.get('content-type') ?? 'text/html; charset=utf-8',
        };
    }
    requestsLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function jpdbParseResponse() {
    return {
        vocabulary: [[
            424242,
            1,
            0,
            TARGET,
            READING,
            3000,
            ['n'],
            [['English conversation']],
            [['n']],
            ['not-in-deck'],
            [],
            null,
        ]],
        tokens: [[[0, 0, TARGET.length, [['英会', 'えいかい'], ['話', 'わ']]]]],
    };
}

async function wordGeometry(page, selector) {
    return page.evaluate(targetSelector => {
        const word = document.querySelector(targetSelector);
        if (!(word instanceof HTMLElement)) throw new Error('word missing');
        const rect = word.getBoundingClientRect();
        const ocrBases = Array.from(word.querySelectorAll('.jpdb-ocr-ruby-base'));
        const baseElements = ocrBases.length ? ocrBases : Array.from(word.querySelectorAll('.jpdb-reader-ruby-base'));
        const bases = baseElements
            .map(base => {
                const baseRect = base.getBoundingClientRect();
                return {
                    left: baseRect.left - rect.left,
                    right: baseRect.right - rect.left,
                    width: baseRect.width,
                };
            });
        const baseLeft = Math.floor(Math.min(...bases.map(base => base.left)));
        const baseRight = Math.ceil(Math.max(...bases.map(base => base.right)));
        const style = getComputedStyle(word);
        return {
            rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
            },
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
            baseLeft,
            baseRight,
            baseWidth: baseRight - baseLeft,
            bases,
            pitchClass: word.dataset.pitchClass ?? '',
            textDecorationColor: style.textDecorationColor,
            textDecorationThickness: style.textDecorationThickness,
            textUnderlineOffset: style.textUnderlineOffset,
            textDecorationSkipInk: style.textDecorationSkipInk,
        };
    }, selector);
}

async function rubyDecorationInfo(page, selector) {
    return page.evaluate(targetSelector => {
        const word = document.querySelector(targetSelector);
        if (!(word instanceof HTMLElement)) throw new Error('word missing');
        const bases = Array.from(word.querySelectorAll('.jpdb-reader-ruby-base, .jpdb-ocr-ruby-base'));
        const children = bases.map(base => {
            const style = getComputedStyle(base);
            return {
                text: base.textContent ?? '',
                backgroundColor: style.backgroundColor,
                boxShadow: style.boxShadow,
            };
        });
        return {
            children,
            hasDecoratedChildren: children.some(child => {
                const background = child.backgroundColor.replace(/\s+/g, '').toLowerCase();
                return background !== 'transparent'
                    && background !== 'rgba(0,0,0,0)'
                    || child.boxShadow !== 'none';
            }),
        };
    }, selector);
}

async function fixtureClip(page) {
    return page.evaluate(() => {
        const rect = document.querySelector('[data-pitch-fixture]').getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
}

function paddedClip(clip, padding = 18) {
    return {
        x: Math.max(0, Math.floor(clip.x - padding)),
        y: Math.max(0, Math.floor(clip.y - padding)),
        width: Math.ceil(clip.width + padding * 2),
        height: Math.ceil(clip.height + padding * 2),
    };
}

function analyzeUnderline(buffer, geometry, targetRgb) {
    const png = decodePng(buffer);
    const pitchRows = [];
    for (let y = 0; y < png.height; y++) {
        let count = 0;
        for (let x = 0; x < png.width; x++) {
            if (isPitchPixel(png, x, y, targetRgb)) count += 1;
        }
        if (count) pitchRows.push({ y, count });
    }
    pitchRows.sort((a, b) => b.count - a.count);
    const row = pitchRows[0] ?? { y: -1, count: 0 };
    const activeColumns = new Array(png.width).fill(false);
    for (let y = Math.max(0, row.y - 1); y <= Math.min(png.height - 1, row.y + 1); y++) {
        for (let x = 0; x < png.width; x++) {
            if (isPitchPixel(png, x, y, targetRgb)) activeColumns[x] = true;
        }
    }
    const offsetX = Math.round(geometry.cropOffsetX ?? 0);
    const baseStart = clamp(Math.floor(geometry.baseLeft + offsetX), 0, png.width - 1);
    const baseEnd = clamp(Math.ceil(geometry.baseRight + offsetX), baseStart + 1, png.width);
    const runs = columnRuns(activeColumns, baseStart, baseEnd).filter(run => run.width >= 2);
    const coveredColumns = activeColumns.slice(baseStart, baseEnd).filter(Boolean).length;
    return {
        image: { width: png.width, height: png.height },
        sampledRow: row.y,
        sampledRowPitchPixels: row.count,
        baseStart,
        baseEnd,
        baseWidth: baseEnd - baseStart,
        runs,
        largestInternalGap: largestInternalGap(activeColumns, baseStart, baseEnd),
        coverage: Number((coveredColumns / Math.max(1, baseEnd - baseStart)).toFixed(3)),
    };
}

function isPitchPixel(png, x, y, targetRgb) {
    const offset = (y * png.width + x) * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    if (a < 120) return false;
    const distance = Math.abs(r - targetRgb.r) + Math.abs(g - targetRgb.g) + Math.abs(b - targetRgb.b);
    return distance < 115 && r > 180 && g > 90 && b < 90;
}

function columnRuns(columns, start, end) {
    const runs = [];
    let runStart = -1;
    for (let x = start; x < end; x++) {
        if (columns[x]) {
            if (runStart < 0) runStart = x;
            continue;
        }
        if (runStart >= 0) {
            runs.push({ start: runStart, end: x, width: x - runStart });
            runStart = -1;
        }
    }
    if (runStart >= 0) runs.push({ start: runStart, end, width: end - runStart });
    return runs;
}

function largestInternalGap(columns, start, end) {
    const runs = columnRuns(columns, start, end);
    if (runs.length <= 1) return 0;
    let largest = 0;
    for (let index = 1; index < runs.length; index++) {
        largest = Math.max(largest, runs[index].start - runs[index - 1].end);
    }
    return largest;
}

function decodePng(buffer) {
    const signature = buffer.subarray(0, 8).toString('hex');
    assert(signature === '89504e470d0a1a0a', 'Screenshot was not a PNG');
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    assert(bitDepth === 8 && (colorType === 6 || colorType === 2) && interlace === 0, 'Unsupported PNG format', { bitDepth, colorType, interlace });
    const channels = colorType === 6 ? 4 : 3;
    const stride = width * channels;
    const raw = inflateSync(Buffer.concat(idat));
    const rgba = Buffer.alloc(width * height * 4);
    let rawOffset = 0;
    let outOffset = 0;
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[rawOffset++];
        const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
        rawOffset += stride;
        const current = unfilterScanline(filter, scanline, previous, channels);
        for (let x = 0; x < width; x++) {
            const input = x * channels;
            rgba[outOffset++] = current[input];
            rgba[outOffset++] = current[input + 1];
            rgba[outOffset++] = current[input + 2];
            rgba[outOffset++] = channels === 4 ? current[input + 3] : 255;
        }
        previous = current;
    }
    return { width, height, data: rgba };
}

function unfilterScanline(filter, scanline, previous, bpp) {
    const out = Buffer.alloc(scanline.length);
    for (let index = 0; index < scanline.length; index++) {
        const left = index >= bpp ? out[index - bpp] : 0;
        const up = previous[index] ?? 0;
        const upLeft = index >= bpp ? previous[index - bpp] ?? 0 : 0;
        if (filter === 0) out[index] = scanline[index];
        else if (filter === 1) out[index] = (scanline[index] + left) & 0xff;
        else if (filter === 2) out[index] = (scanline[index] + up) & 0xff;
        else if (filter === 3) out[index] = (scanline[index] + Math.floor((left + up) / 2)) & 0xff;
        else if (filter === 4) out[index] = (scanline[index] + paeth(left, up, upLeft)) & 0xff;
        else throw new Error(`Unsupported PNG filter ${filter}`);
    }
    return out;
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}

function hexToRgb(hex) {
    const value = hex.replace(/^#/, '');
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
