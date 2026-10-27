import * as smokeDependencyFiles from 'node:fs';
import * as smokeDependencyPaths from 'node:path';
import * as smokeDependencyCompression from 'node:zlib';
import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyHarness from './smoke-harness.mjs';
import * as smokeDependencySmokeHelpers from './smoke-test-helpers.mjs';
import * as smokeDependencyBundler from 'esbuild';
import { closeServer as closeCellServer } from './smoke-harness.mjs';

// Former pitch-underline-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertPitchUnderline(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { mkdirSync, writeFileSync } = smokeDependencyFiles;
    const { default: path } = smokeDependencyPaths;
    const { inflateSync } = smokeDependencyCompression;
    const { chromium, webkit } = smokeDependencyBrowsers;
    const { addGmStorageBridgeInitScript, assert, assertBuiltArtifacts, createSmokePaths, jsonHttpResponse, startLoopbackServer, YOMU_SETTINGS_KEY } = smokeDependencyHarness;
    const { addScriptTagWithCspFallback, installUserscriptCssResource } = smokeDependencySmokeHelpers;
const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(_sourceDir);
const NEWTAB_CSS_PATH = path.join(NEWTAB_DIR, 'styles.css');
const PAGE_PATH = '/pitch-underline.html';
const TARGET = '英会話';
const READING = 'えいかいわ';
const ADJACENT_TARGET = 'する';
const SENTENCE = `${TARGET}${ADJACENT_TARGET}練習をします。`;
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
    pitchColorUnknown: '#94a3b8',
    corsProxyUrl: '',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, NEWTAB_CSS_PATH], ROOT, 'Run npm run build first.');

const requests = [];
const server = await startLoopbackServer(serveFixture, 'Could not bind pitch underline smoke server');
const engineName = _hostEngine;
const browserType = engineName === 'webkit' ? webkit : chromium;
const browser = _hostBrowser;

try {
    const context = await browser.newContext({
        bypassCSP: true,
        viewport: { width: 900, height: 720 },
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
    const adjacentSelector = `.jpdb-reader-word[data-expression="${ADJACENT_TARGET}"]`;
    await page.waitForFunction(selector => {
        const word = document.querySelector(selector);
        return word
            && word.dataset.pitchClass
            && word.dataset.pitchClass !== 'unknown'
            && !word.classList.contains('jpdb-reader-has-furi');
    }, adjacentSelector, { timeout: 20_000 });
    await page.waitForTimeout(120);

    const pitchRequestCount = requests.filter(request => request.kind === 'jpdb-public-pitch').length;
    assert(pitchRequestCount > 0, 'Expected real JPDB public pitch lookup to be used.', { requests });

    await scrollFixtureTargetIntoView(page, wordSelector);
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
    }, rgbFromCssColor(geometry.underlineColor, TARGET_RGB));
    const adjacentGeometry = await wordGeometry(page, adjacentSelector);
    const adjacentClip = paddedClip(adjacentGeometry.rect, 22);
    const adjacentScreenshot = await page.screenshot({ clip: adjacentClip });
    const adjacentAnalysis = analyzeUnderline(adjacentScreenshot, {
        ...adjacentGeometry,
        cropOffsetX: adjacentGeometry.rect.x - adjacentClip.x,
    }, rgbFromCssColor(adjacentGeometry.underlineColor, TARGET_RGB));
    const underlineBaselineDelta = Math.abs(
        wordClip.y + analysis.sampledRow - (adjacentClip.y + adjacentAnalysis.sampledRow),
    );
    await scrollFixtureTargetIntoView(page, '#mixed-mirror-word');
    const mixedMirrorGeometry = await wordGeometry(page, '#mixed-mirror-word');
    const mixedPlainGeometry = await wordGeometry(page, '#mixed-plain-word');
    const mixedMirrorClip = paddedClip(mixedMirrorGeometry.rect, 22);
    const mixedPlainClip = paddedClip(mixedPlainGeometry.rect, 22);
    const mixedMirrorAnalysis = analyzeUnderline(await page.screenshot({ clip: mixedMirrorClip }), {
        ...mixedMirrorGeometry,
        cropOffsetX: mixedMirrorGeometry.rect.x - mixedMirrorClip.x,
    }, rgbFromCssColor(mixedMirrorGeometry.underlineColor, TARGET_RGB));
    const mixedPlainAnalysis = analyzeUnderline(await page.screenshot({ clip: mixedPlainClip }), {
        ...mixedPlainGeometry,
        cropOffsetX: mixedPlainGeometry.rect.x - mixedPlainClip.x,
    }, rgbFromCssColor(mixedPlainGeometry.underlineColor, TARGET_RGB));
    const mixedUnderlineBaselineDelta = Math.abs(
        mixedMirrorClip.y + mixedMirrorAnalysis.sampledRow
        - (mixedPlainClip.y + mixedPlainAnalysis.sampledRow),
    );
    const screenshotPath = path.join(ARTIFACTS, SCREENSHOT_NAME);
    await page.screenshot({ path: screenshotPath, clip: paddedClip(await fixtureClip(page)) });

    const fixed = analysis.largestInternalGap <= 2
        && analysis.coverage >= 0.92
        && geometry.textDecorationSkipInk === 'none'
        && !rubyDecorations.hasDecoratedChildren
        && underlineBaselineDelta <= 1
        && mixedUnderlineBaselineDelta <= 1
        && mixedMirrorAnalysis.largestInternalGap <= 2
        && mixedMirrorAnalysis.coverage >= 0.9
        && mixedPlainAnalysis.largestInternalGap <= 2
        && mixedPlainAnalysis.coverage >= 0.78;
    const report = {
        ok: EXPECT_MODE === 'broken' ? !fixed : fixed,
        expect: EXPECT_MODE,
        fixed,
        target: TARGET,
        adjacentTarget: ADJACENT_TARGET,
        engine: engineName,
        reading: READING,
        sentence: SENTENCE,
        pitchClass: geometry.pitchClass,
        pitchRequests: requests.filter(request => request.kind === 'jpdb-public-pitch').map(request => request.url),
        parseRequests: requests.filter(request => request.kind === 'jpdb-parse').length,
        screenshot: screenshotPath,
        wordScreenshot: path.join(ARTIFACTS, WORD_SCREENSHOT_NAME),
        underline: analysis,
        adjacentUnderline: adjacentAnalysis,
        underlineBaselineDelta,
        mixedUnderline: {
            mirror: mixedMirrorAnalysis,
            plain: mixedPlainAnalysis,
            baselineDelta: mixedUnderlineBaselineDelta,
            mirrorGeometry: mixedMirrorGeometry,
            plainGeometry: mixedPlainGeometry,
        },
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
    await closeCellServer(server.server);
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
      padding: 24px 0;
      box-sizing: border-box;
      background: #18151b;
      color: #fff;
      font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif;
    }
    main {
      width: min(820px, calc(100vw - 48px));
      margin: 0 auto;
      text-align: center;
      --jpdb-reader-accent: ${PITCH_COLOR};
      --jpdb-reader-accent-readable: ${PITCH_COLOR};
      --jpdb-reader-example-target-underline: ${PITCH_COLOR};
    }
    [data-pitch-scene] {
      position: relative;
      min-height: 600px;
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
    [data-pitch-ocr-line],
    [data-mixed-baseline] {
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
    [data-mixed-baseline] { margin-top: 28px; }
  </style>
</head>
<body>
  <main data-pitch-fixture class="jpdb-reader-newtab-immersion">
    <section data-pitch-scene class="jpdb-reader-example-card has-image">
      <p class="jpdb-reader-example-sentence jpdb-reader-parseable" data-pitch-sentence>${SENTENCE}</p>
    </section>
    <p data-mixed-baseline data-jpdb-reader-root class="jpdb-reader-word-underline-pitch">
      <span class="jpdb-reader-text-mirror jpdb-reader-additive-text-mirror" style="display:inline">
        <span id="mixed-mirror-word" class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-has-furi jpdb-pitch-heiban" data-pitch-class="heiban">
          <ruby><span class="jpdb-reader-ruby-base">立</span><rt class="jpdb-reader-furi">た</rt></ruby>つ
        </span>
      </span><span id="mixed-plain-word" class="jpdb-reader-word jpdb-reader-scan-word jpdb-pitch-atamadaka" data-pitch-class="atamadaka" style="--jpdb-reader-pitch-atamadaka:#f43f5e">文</span>
    </p>
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
        ], [
            424243,
            1,
            0,
            ADJACENT_TARGET,
            ADJACENT_TARGET,
            800,
            ['v'],
            [['do']],
            [['v']],
            ['not-in-deck'],
            ['LH'],
            null,
        ]],
        tokens: [[
            [0, 0, TARGET.length, [['英会', 'えいかい'], ['話', 'わ']]],
            [1, TARGET.length, ADJACENT_TARGET.length, []],
        ]],
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
        const baseLeft = bases.length ? Math.floor(Math.min(...bases.map(base => base.left))) : 0;
        const baseRight = bases.length ? Math.ceil(Math.max(...bases.map(base => base.right))) : Math.ceil(rect.width);
        const style = getComputedStyle(word);
        const underlineStyle = getComputedStyle(word, '::after');
        const sceneRect = word.closest('[data-pitch-scene]')?.getBoundingClientRect();
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
            underlineColor: underlineStyle.borderBlockEndColor || underlineStyle.borderBottomColor,
            wordUnderline: style.getPropertyValue('--jpdb-reader-word-underline').trim(),
            sourcePitchDecoration: style.getPropertyValue('--jpdb-reader-source-pitch-decoration').trim(),
            pitchColor: style.getPropertyValue('--jpdb-reader-pitch-color').trim(),
            viewport: {
                scrollY: window.scrollY,
                innerHeight: window.innerHeight,
                scrollHeight: document.documentElement.scrollHeight,
                sceneTop: sceneRect?.top ?? null,
                sceneBottom: sceneRect?.bottom ?? null,
            },
        };
    }, selector);
}

function rgbFromCssColor(value, fallback) {
    const channels = String(value).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i);
    return channels ? {
        r: Number(channels[1]),
        g: Number(channels[2]),
        b: Number(channels[3]),
        a: channels[4] === undefined ? 1 : Number(channels[4]),
    } : { ...fallback, a: fallback.a ?? 1 };
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

async function scrollFixtureTargetIntoView(page, selector) {
    await page.evaluate(targetSelector => {
        document.querySelector(targetSelector)?.scrollIntoView({ block: 'center', inline: 'center' });
    }, selector);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function analyzeUnderline(buffer, geometry, targetRgb) {
    assert((targetRgb.a ?? 1) > 0.05,
        'Pitch underline computed to a transparent colour.', { targetRgb, geometry });
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
    return distance < 115;
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

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former underline-colour-sources-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertUnderlineColourSources(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { mkdirSync, readFileSync, writeFileSync } = smokeDependencyFiles;
    const { default: path } = smokeDependencyPaths;

    const { addGmStorageBridgeInitScript, assert, assertBuiltArtifacts, createSmokePaths, jsonHttpResponse, mockAnkiConnectResponse, mockJpdbParseFromVocabulary, readJsonBody, startLoopbackServer, YOMU_SETTINGS_KEY } = smokeDependencyHarness;
    const { addScriptTagWithCspFallback, installUserscriptCssResource } = smokeDependencySmokeHelpers;
// Regression guard: an underline is drawn only for information the learner has
// a colour for. 1.6.98 settled that for unknown pitch; two paths still drew a
// grey the learner never picked:
//   * a compound with no whole-word accent but one resolved part (申し訳ありません)
//     painted the unresolved part in the "Unknown" pitch swatch, and the
//     "hide this group", "Only new" and "Hide JPDB-redundant styling" options
//     left that gradient in place;
//   * under a deck-status underline (JPDB/Jiten status or Status), every word in
//     none of the learner's decks got a derived grey with no picker. Not-in-deck
//     now ranks last on that underline: alone it draws nothing, and beside a
//     state the learner has a colour for (JPDB New that Anki lacks, a Study
//     word Anki tracks) that state's colour shows.
//
// Page lane: the built userscript and yomu.css on a fixture page, with JPDB
// parse, public Jiten and AnkiConnect mocked, so the runtime's gradient and
// readability pass are the real ones. Static lane: FIXTURE markup under the
// built yomu.css for the pure cascade contracts (the subtitle channel, additive
// mirrors, the "Only new" and redundant opt-outs), and under the built Study
// CSS for the prompt headword, which keeps its pitch underline in every
// word-underline mode, and for Study words Anki tracks. Chromium by default;
// YOMU_UNDERLINE_SOURCES_ENGINE=webkit checks the !important custom-property
// override in WebKit.

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(_sourceDir);
const STUDY_CSS_PATH = path.join(NEWTAB_DIR, 'styles.css');
const ENGINE = _hostEngine;
const OUT = path.join(ARTIFACTS, 'underline-colour-sources', ENGINE);
const HEIBAN = 'rgb(53, 158, 255)';
const LEARNING = 'rgb(255, 209, 102)';
const UNKNOWN_SWATCH = 'rgb(148, 163, 184)';
// The default New seed is white; on a white page the contrast pass draws it
// in the ink-and-paper New token, #687384 (theme/color-tokens.ts), so it
// stays visible and quiet. That grey is by design and must survive.
const NEW_ON_WHITE = 'rgb(104, 115, 132)';

// [surface, spelling, reading, gloss, pos, frequency, state, pitch]
const DECK_ROWS = [
    ['英会話', '英会話', 'えいかいわ', 'English conversation', ['n'], 3000, ['not-in-deck'], []],
    ['練習', '練習', 'れんしゅう', 'practice', ['n'], 900, ['not-in-deck'], ['LHHH']],
    ['新しい', '新しい', 'あたらしい', 'new', ['adj-i'], 200, ['new'], ['LHHLL']],
    ['言葉', '言葉', 'ことば', 'word', ['n'], 300, ['known'], ['LHH']],
    ['毎日', '毎日', 'まいにち', 'every day', ['n'], 400, ['due'], ['HLLL']],
    ['勉強', '勉強', 'べんきょう', 'study', ['n'], 500, ['failed'], ['LHHH']],
    ['上手', '上手', 'じょうず', 'skilful', ['adj-na'], 600, ['blacklisted'], ['LHH']],
    ['を', 'を', 'を', 'object marker', ['prt'], 1, ['not-in-deck'], []],
];
const DECK_TEXT = '英会話を練習。新しい言葉を毎日勉強。上手。';
const COMPOUND = '申し訳ありません';
const COMPOUND_ROWS = [[COMPOUND, COMPOUND, 'もうしわけありません', 'I am sorry', ['exp'], 1500, ['not-in-deck'], []]];
const COMPOUND_FURIGANA = { [COMPOUND]: [['申', 'もう'], 'し', ['訳', 'わけ'], 'ありません'] };
// Public Jiten decomposes the expression: 申し訳 has a heiban accent and the
// inflected tail ありません has none, so only the first part resolves.
const COMPOUND_WORD_ID = 501;
const COMPOUND_INFO = {
    wordId: COMPOUND_WORD_ID,
    mainReading: { text: '申[もう]し訳[わけ]ありません', frequencyRank: 1500 },
    partsOfSpeech: ['exp'],
    pitchAccents: [],
    definitions: [{ meanings: ['I am sorry'] }],
    composedOf: [
        { matchSurface: '申し訳', readingFurigana: '申[もう]し訳[わけ]', reading: 'もうしわけ', pitchAccents: [0] },
        { matchSurface: 'ありません', reading: 'ありません', pitchAccents: [] },
    ],
};

const BASE_SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
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
    corsProxyUrl: '',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

const IN_DECK = ['jpdb-new', 'jpdb-known', 'jpdb-due', 'jpdb-failed', 'jpdb-blacklisted'];
// These scenarios test the underline beside the not-in-deck highlight wash
// with every state coloured, which since 2.1 (ADR-0026) is a choice: pin it.
const DECK_CHANNELS = { wordHighlightColorSource: 'jpdb', wordColorHiddenStateGroups: [] };
const DECK_SCENARIOS = [
    { id: 'underline-jpdb-light', theme: 'light', settings: { ...DECK_CHANNELS, wordUnderlineColorSource: 'jpdb' }, rootClass: 'jpdb-reader-word-underline-jpdb' },
    { id: 'underline-jpdb-dark', theme: 'dark', settings: { ...DECK_CHANNELS, wordUnderlineColorSource: 'jpdb' }, rootClass: 'jpdb-reader-word-underline-jpdb' },
    // With Anki on, an ordinary page projects Anki's verdict as a second state
    // class, so every word the mock collection lacks also carries
    // jpdb-not-in-deck. Each channel's colour cascade ranks some states below
    // not-in-deck (New, and Ignored under Status); those painted the
    // not-in-deck grey and must now show their own colour, the same as on the
    // page without Anki.
    { id: 'underline-jpdb-anki-light', theme: 'light', settings: { ...DECK_CHANNELS, wordUnderlineColorSource: 'jpdb', ankiEnabled: true }, rootClass: 'jpdb-reader-word-underline-jpdb', sameAs: 'underline-jpdb-light' },
    // Status needs a review source beside the deck state, or it resolves to
    // the JPDB channel.
    { id: 'underline-status-light', theme: 'light', settings: { ...DECK_CHANNELS, wordUnderlineColorSource: 'status', ankiEnabled: true }, rootClass: 'jpdb-reader-word-underline-status', sameAs: 'underline-jpdb-light' },
];

// [matches(url), respond(request, rows, url)], first match wins.
const ROUTES = [
    [url => url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse', (request, rows) => mockJpdbParseFromVocabulary(readJsonBody(request.data), rows, {
        tokenReading: entry => COMPOUND_FURIGANA[entry.surface] ?? [[entry.surface, entry.reading]],
    })],
    // The reader batches deinflection candidates as one 。-joined text.
    [url => url.hostname === 'api.jiten.moe' && url.pathname.endsWith('/vocabulary/parse'), (request, rows, url) => (url.searchParams.get('text') ?? '')
        .split('。').filter(Boolean).flatMap(term => [
            { wordId: term === COMPOUND ? COMPOUND_WORD_ID : 0, readingIndex: 0, originalText: term },
            { wordId: 0, readingIndex: 0, originalText: '。' },
        ])],
    [url => url.hostname === 'api.jiten.moe' && url.pathname.endsWith(`/vocabulary/${COMPOUND_WORD_ID}/0/info`), () => COMPOUND_INFO],
    [url => url.port === '8765', request => mockAnkiConnectResponse(readJsonBody(request.data), action => (action === 'version' ? 6 : []))],
];

assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, STUDY_CSS_PATH], ROOT, 'Run npm run build first.');
mkdirSync(OUT, { recursive: true });
const READER_CSS = readFileSync(CSS_PATH, 'utf8');
const STUDY_CSS = readFileSync(STUDY_CSS_PATH, 'utf8');

let currentPage = '';
const server = await startLoopbackServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(currentPage);
}, 'Could not bind underline colour sources smoke server');
const browser = _hostBrowser;
const report = { engine: ENGINE, page: {}, subtitles: {}, study: {}, failures: [] };

try {
    await checkCompoundPitch();
    await checkDeckStatusUnderline();
    await checkSubtitleUnderline();
    await checkMirrorUnderline();
    await checkStudyHeadword();
} finally {
    writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await closeCellServer(server.server);
}
// Every behaviour check runs before failing, so one run shows the whole gap.
assert(!report.failures.length, `${report.failures.length} underline colour source check(s) failed (details: ${path.join(OUT, 'report.json')}):\n- ${report.failures.map(failure => failure.message).join('\n- ')}`);
console.log(`underline colour sources smoke passed (${ENGINE}); report: ${path.join(OUT, 'report.json')}`);

async function checkCompoundPitch() {
    // Pitch underlines are a choice since 2.1 (ADR-0026); a compound keeps its
    // per-part colours when the learner makes it.
    const defaults = await compoundScenario('compound-pitch', { wordUnderlineColorSource: 'pitch' });
    const colours = gradientColours(defaults.gradient);
    expect(colours.includes(HEIBAN), 'The resolved part of a compound should keep its pitch colour.', defaults);
    expect(!colours.includes(UNKNOWN_SWATCH), 'A compound part with unknown pitch must not paint the grey "Unknown" swatch.', defaults);
    expect(colours.filter(colour => colour !== HEIBAN).every(isTransparent),
        'Every unresolved compound part should leave its underline segment bare.', defaults);

    const hidden = await compoundScenario('compound-hide-new', { wordUnderlineColorSource: 'pitch', wordColorHiddenStateGroups: ['new'] });
    expect(hidden.gradient === 'none', 'Hiding a word group\'s colours should also hide its compound pitch underline.', hidden);

    // "Only new / not-in-deck words" keeps this not-in-deck compound by design,
    // so its opt-out is checked on fixture markup: a known compound loses the
    // inline gradient, a New one keeps it.
    const gradients = (rootClass, states) => readStaticFixture(compoundFixture(rootClass, states), Object.keys(states),
        word => getComputedStyle(word, '::after').backgroundImage);
    const newOnly = await gradients('yomu-word-color-new-only', { known: 'known', fresh: 'new' });
    report.page['compound-new-only-fixture'] = newOnly;
    expect(newOnly.known === 'none', '"Only new / not-in-deck words" should drop a known compound\'s pitch underline.', newOnly);
    expect(newOnly.fresh !== 'none', '"Only new / not-in-deck words" should keep a New compound\'s pitch underline.', newOnly);

    const redundant = await gradients('jpdb-reader-suppress-redundant', { redundant: 'redundant', known: 'known' });
    report.page['compound-suppress-redundant-fixture'] = redundant;
    expect(redundant.redundant === 'none', '"Hide JPDB-redundant styling" should drop a redundant compound\'s pitch underline.', redundant);
    expect(redundant.known !== 'none', '"Hide JPDB-redundant styling" should keep a known compound\'s pitch underline.', redundant);
}

async function compoundScenario(id, settings) {
    const result = await runPageScenario({
        id,
        theme: 'light',
        text: `${COMPOUND}。`,
        rows: COMPOUND_ROWS,
        settings,
        ready: () => document.querySelector('#probe .jpdb-reader-word[data-pitch-components="true"]'),
    });
    const word = result.words.find(entry => entry.text.startsWith('申'));
    assert(word, 'The compound was not annotated.', result);
    const summary = { root: result.root, classes: word.classes.join(' '), gradient: word.gradient };
    report.page[id] = summary;
    return summary;
}

async function checkDeckStatusUnderline() {
    const defaults = await deckScenario('deck-defaults', 'light', {});
    // The default underline carries deck state (ADR-0026): a word in no deck,
    // even one with a known pitch, draws nothing, and a New word draws its colour.
    expect(isTransparent(defaults.words.find(word => word.text === '練習')?.underline),
        'By default a not-in-deck word should carry no underline, whatever its pitch.', defaults);
    expect(defaults.words.find(word => word.classes.includes('jpdb-new'))?.underline === NEW_ON_WHITE,
        'By default a New word should carry its state underline.', defaults);
    for (const scenario of DECK_SCENARIOS) {
        expectNoNotInDeckUnderline(scenario, await deckScenario(scenario.id, scenario.theme, scenario.settings));
    }
    // Exact, because the not-in-deck grey it used to get with Anki on
    // (rgb(120, 125, 134)) is close.
    for (const id of ['underline-jpdb-light', 'underline-jpdb-anki-light', 'underline-status-light']) {
        const result = report.page[id];
        expect(result.words.find(word => word.classes.includes('jpdb-new'))?.underline === NEW_ON_WHITE,
            `${id}: a white New underline on a white page should still take the #687384 page token, Anki card or not.`, result);
    }
}

function expectNoNotInDeckUnderline({ id, rootClass, sameAs }, result) {
    assert(result.root.split(' ').includes(rootClass), `Expected the page to use ${rootClass}.`, result);
    const untracked = result.words.filter(word => word.classes.includes('jpdb-not-in-deck') && !word.classes.some(isOtherDeckState));
    assert(untracked.length >= 3, 'Expected the words in no deck to be annotated.', result);
    expect(untracked.every(word => isTransparent(word.underline)),
        `${id}: words in none of the learner's decks should get no deck-status underline.`, result);
    expect(untracked.every(word => !isTransparent(word.highlight)),
        `${id}: words in no deck should keep their quiet highlight wash.`, result);
    for (const state of IN_DECK) {
        expect(!isTransparent(result.words.find(word => word.classes.includes(state))?.underline),
            `${id}: a ${state} word should keep its state underline.`, result);
    }
    if (sameAs) expectSameStateUnderlines(id, result, report.page[sameAs]);
}

// The same words without Anki's not-in-deck beside them: same state, same
// colour, not the not-in-deck grey. The readability pass may move a colour a
// shade, because the not-in-deck wash behind it is lighter.
function expectSameStateUnderlines(id, result, reference) {
    for (const word of result.words.filter(entry => entry.classes.some(isOtherDeckState))) {
        const without = reference.words.find(entry => entry.text === word.text);
        expect(colourDistance(word.underline, without?.underline) <= 24,
            `${id}: ${word.text}, which Anki lacks, should keep the underline it has without Anki.`, { word, without });
    }
}

async function deckScenario(id, theme, settings) {
    const result = await runPageScenario({
        id,
        theme,
        text: DECK_TEXT,
        rows: DECK_ROWS,
        settings,
        // The readability pass writes the accessible underline on the New
        // word; wait for it so the darkening is measured, not raced.
        ready: () => {
            const words = document.querySelectorAll('#probe .jpdb-reader-word[class*="jpdb-"]');
            const fresh = document.querySelector('#probe .jpdb-reader-word.jpdb-new');
            return words.length >= 8 && fresh?.style.getPropertyValue('--jpdb-reader-word-accessible-color');
        },
    });
    report.page[id] = { root: result.root, words: result.words };
    return result;
}

async function runPageScenario({ id, theme, text, rows, settings, ready }) {
    currentPage = fixturePage(theme, text);
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 900, height: 480 }, deviceScaleFactor: 1, colorScheme: theme });
    try {
        const page = await context.newPage();
        if (process.env.SMOKE_DEBUG) page.on('console', message => console.error('[console]', message.text().slice(0, 240)));
        const bridge = `__yomuUnderlineSourcesSmoke_${id.replace(/\W/g, '_')}`;
        await page.exposeFunction(bridge, request => handleRequest(request, rows));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: { ...BASE_SETTINGS, ...settings },
            requestBridgeName: bridge,
        });
        await page.goto(`${server.origin}/underline-colour-sources.html`, { waitUntil: 'domcontentloaded' });
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(ready, null, { timeout: 20_000 });
        // Let enrichment and the contrast pass settle before reading paint.
        await page.waitForTimeout(400);
        await page.locator('#probe').screenshot({ path: path.join(OUT, `${id}.png`) });
        return await page.evaluate(readWords);
    } finally {
        await context.close();
    }
}

function readWords() {
    const words = Array.from(document.querySelectorAll('#probe .jpdb-reader-word')).map(word => {
        const after = getComputedStyle(word, '::after');
        return {
            text: word.dataset.expression || word.textContent.trim(),
            classes: Array.from(word.classList).filter(name => /^(jpdb|jiten|anki)-/.test(name)),
            underline: after.borderBottomWidth === '0px' ? 'none' : after.borderBottomColor,
            gradient: after.backgroundImage,
            highlight: getComputedStyle(word).backgroundImage,
        };
    });
    const root = Array.from(document.documentElement.classList).filter(name => /underline|word-color/.test(name)).join(' ');
    return { root, words };
}

async function checkSubtitleUnderline() {
    const results = {};
    for (const underline of ['pitch', 'off', 'jpdb', 'status']) {
        results[underline] = await readStaticFixture(subtitleFixture(underline), ['not-in-deck', 'new', 'known', 'projected', 'projected-new', 'projected-ignored', 'study'], word => ({
            underline: getComputedStyle(word, '::after').borderBottomColor,
            highlight: getComputedStyle(word).backgroundImage,
            subtitleHighlight: getComputedStyle(word).getPropertyValue('--jpdb-reader-subtitle-highlight').trim(),
        }));
    }
    report.subtitles = results;
    // Under subtitle highlight JPDB the not-in-deck wash is painted, and no
    // underline mode may touch it.
    const wash = results.pitch['not-in-deck'].highlight;
    expect(!isTransparent(wash), 'A not-in-deck subtitle word should keep its highlight wash under defaults.', results);
    expect(['off', 'jpdb', 'status'].every(mode => results[mode]['not-in-deck'].highlight === wash
        && results[mode]['not-in-deck'].subtitleHighlight === results.pitch['not-in-deck'].subtitleHighlight),
    'The subtitle underline mode must not change the not-in-deck highlight wash.', results);

    for (const mode of ['jpdb', 'status']) {
        expect(isTransparent(results[mode]['not-in-deck'].underline),
            `A not-in-deck subtitle word should get no ${mode} underline.`, results);
        expect(['new', 'known', 'projected'].every(id => !isTransparent(results[mode][id].underline)),
            `In-deck subtitle words, including one Anki holds no card for, should keep their ${mode} underline.`, results);
        expect(results[mode]['projected-new'].underline === results[mode].new.underline,
            `A JPDB New subtitle word Anki lacks should keep the New ${mode} underline.`, results);
    }
    expect(results.status['projected-ignored'].underline === results.jpdb['projected-ignored'].underline
        && !isTransparent(results.status['projected-ignored'].underline),
    'An Ignored subtitle word Anki lacks should keep the Ignored Status underline.', results);
    // Study marks a word Anki holds with its Anki state; Status still
    // shows that state for a keyless Jiten word no JPDB/Jiten deck has.
    expect(results.status.study.underline === LEARNING, 'A not-in-deck Study word with an Anki state keeps its Status underline.', results);
}

// Additive mirrors (YouTube buttons, menus, comments) cannot repaint the host's
// glyphs, so every colour mode, highlight included, lands on their underline.
// They follow the page: not-in-deck alone draws nothing there either.
async function checkMirrorUnderline() {
    const results = {};
    for (const roots of ['jpdb-reader-word-highlight-jpdb', 'jpdb-reader-word-underline-status']) {
        results[roots] = await readStaticFixture(mirrorFixture(roots), ['not-in-deck', 'projected-new', 'known'],
            word => getComputedStyle(word, '::after').borderBottomColor);
    }
    report.mirrors = results;
    for (const result of Object.values(results)) {
        expect(isTransparent(result['not-in-deck']), 'A not-in-deck word on an additive mirror should get no underline.', results);
        expect(['projected-new', 'known'].every(id => !isTransparent(result[id])),
            'Words with a state, including a New one Anki lacks, keep their underline on an additive mirror.', results);
    }
}

// Study draws the prompt and recall headword on its pitch underline whatever
// the word-underline mode, so the not-in-deck reset must not outrank that rule.
// A not-in-deck word elsewhere in Study still gets no deck-status underline.
async function checkStudyHeadword() {
    const results = {};
    for (const underline of ['pitch', 'jpdb', 'status']) {
        results[underline] = await readStaticFixture(studyFixture(underline), ['headword', 'jiten-headword', 'sentence-word', 'anki-word'],
            word => getComputedStyle(word, '::after').borderBottomColor);
    }
    report.study = results;
    expect(Object.values(results).every(result => result.headword === HEIBAN && result['jiten-headword'] === HEIBAN),
        'A not-in-deck Study headword should keep its pitch underline in every word-underline mode.', results);
    expect(['jpdb', 'status'].every(mode => isTransparent(results[mode]['sentence-word'])),
        'A not-in-deck word outside the Study headword should get no deck-status underline.', results);
    // Keyless public Jiten makes every Study word jpdb- and jiten-not-in-deck;
    // Status still shows the state Anki has for it, and the JPDB/Jiten
    // underline, which never reads Anki, stays bare.
    expect(results.status['anki-word'] === LEARNING, 'A Study word Anki tracks should keep its Anki state on the Status underline.', results);
    expect(isTransparent(results.jpdb['anki-word']), 'The JPDB/Jiten underline should stay bare on a Study word only Anki tracks.', results);
}

// Static fixtures run the built CSS only; `read` runs in the page.
async function readStaticFixture(html, ids, read) {
    const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const results = {};
        for (const id of ids) results[id] = await page.locator(`#${id}`).evaluate(read);
        return results;
    } finally {
        await page.close();
    }
}

// FIXTURE markup: inline compound gradients as rendered-word-state writes them,
// one word per { id: state } entry.
function compoundFixture(rootClass, states) {
    const gradient = 'linear-gradient(to right, var(--jpdb-reader-pitch-heiban) 0%, var(--jpdb-reader-pitch-heiban) 50%, transparent 50%, transparent 100%)';
    const word = (id, state) => `<span id="${id}" class="jpdb-reader-word jpdb-${state} jpdb-pitch-unknown" data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${gradient}">申し訳ない</span>`;
    return `<!doctype html>
<html class="jpdb-reader-word-underline-pitch ${rootClass}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body><p>${Object.entries(states).map(([id, state]) => word(id, state)).join(' ')}</p></body></html>`;
}

// FIXTURE markup: the class shape the subtitle renderer emits on the on-video
// cue, under the root classes applyReaderTheme sets for each underline mode.
function subtitleFixture(underline) {
    return `<!doctype html>
<html class="jpdb-reader-subtitle-highlight-jpdb jpdb-reader-subtitle-underline-${underline}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; background: #101010; color: #fff; font: 40px/1.6 sans-serif; }
</style></head><body>
<div class="jpdb-subtitle-player"><div class="jpdb-subtitle-text"><div class="jpdb-subtitle-primary">
  <span id="not-in-deck" class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">練習</span><span id="new" class="jpdb-reader-word jpdb-new jpdb-pitch-nakadaka" data-pitch-class="nakadaka">新しい</span><span id="known" class="jpdb-reader-word jpdb-known jpdb-pitch-heiban" data-pitch-class="heiban">言葉</span><span id="projected" class="jpdb-reader-word jpdb-known jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">毎日</span><span id="projected-new" class="jpdb-reader-word jpdb-new jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">新しい</span><span id="projected-ignored" class="jpdb-reader-word jpdb-blacklisted jpdb-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">上手</span><span id="study" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck anki-learning jpdb-pitch-heiban" data-pitch-class="heiban">勉強</span>
</div></div></div>
</body></html>`;
}

// FIXTURE markup: the Study prompt headword as renderPromptReaderWord emits it,
// beside sentence words with the classes a keyless Jiten parse and Anki give
// them, under the root classes applyReaderTheme sets.
function studyFixture(underline) {
    const headword = (id, classes) => `<span class="jpdb-reader-newtab-term"><span id="${id}" class="jpdb-reader-word jpdb-reader-parseable ${classes} jpdb-pitch-heiban" data-pitch-class="heiban">練習</span></span>`;
    return `<!doctype html>
<html class="jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-${underline}"><head><meta charset="utf-8"><style>${STUDY_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body>
${headword('headword', 'jpdb-not-in-deck')} ${headword('jiten-headword', 'jpdb-not-in-deck jiten-not-in-deck')}
<p><span id="sentence-word" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck jpdb-pitch-heiban" data-pitch-class="heiban">練習</span><span id="anki-word" class="jpdb-reader-word jpdb-not-in-deck jiten-not-in-deck anki-learning jpdb-pitch-heiban" data-pitch-class="heiban">勉強</span></p>
</body></html>`;
}

// FIXTURE markup: an additive text mirror over a host label, as
// text-mirror rendering emits it, under the given root classes.
function mirrorFixture(roots) {
    const word = (id, classes) => `<span id="${id}" class="jpdb-reader-word ${classes}">語</span>`;
    return `<!doctype html>
<html class="${roots}"><head><meta charset="utf-8"><style>${READER_CSS}
  body { margin: 0; padding: 24px; background: #fff; color: #1f2328; font: 32px/1.9 sans-serif; }
</style></head><body><button><span class="jpdb-reader-text-mirror jpdb-reader-additive-text-mirror">${word('not-in-deck', 'jpdb-not-in-deck')}${word('projected-new', 'jpdb-new jpdb-not-in-deck')}${word('known', 'jpdb-known jpdb-not-in-deck')}</span></button></body></html>`;
}

function fixturePage(theme, text) {
    const [background, color] = theme === 'light' ? ['#ffffff', '#1f2328'] : ['#18151b', '#eeeeee'];
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Yomu underline colour sources smoke</title>
<style>body{margin:0;padding:32px;background:${background};color:${color};font:28px/1.9 "Hiragino Sans","Noto Sans JP",sans-serif}</style>
</head><body><main><p id="probe">${text}</p></main></body></html>`;
}

function handleRequest(request, rows) {
    const url = new URL(request.url);
    if (process.env.SMOKE_DEBUG) console.error('[request]', decodeURIComponent(request.url));
    const route = ROUTES.find(([matches]) => matches(url));
    return route ? jsonHttpResponse(route[1](request, rows, url)) : { status: 404, responseText: '' };
}

function expect(condition, message, details) {
    if (!condition) report.failures.push({ message, details });
}

function gradientColours(value) {
    return (String(value).match(/(?:rgba?|color)\([^)]*\)/g) ?? []).map(normaliseColour);
}

// Engines serialise colour-mix results as color(srgb …); compare in rgb().
function normaliseColour(value) {
    const srgb = String(value).match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
    if (!srgb) return String(value);
    const [r, g, b] = srgb.slice(1, 4).map(channel => Math.round(Number(channel) * 255));
    const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
    return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isOtherDeckState(className) {
    return /^(jpdb|anki)-(new|in-deck|learning|young|known|mature|mastered|never-forget|redundant|due|failed|suspended|blacklisted|locked)$/.test(className);
}

// Largest per-channel gap between two colours; Infinity if either is missing
// or transparent.
function colourDistance(left, right) {
    if (isTransparent(left) || isTransparent(right)) return Infinity;
    const [a, b] = [left, right].map(value => gradientColours(value)[0].match(/[\d.]+/g).map(Number));
    return Math.max(...[0, 1, 2].map(index => Math.abs(a[index] - b[index])));
}

// 'none', a transparent colour, or a gradient whose every stop is transparent.
function isTransparent(value) {
    return gradientColours(value).every(colour => /^rgba\([^)]*, 0\)$/.test(colour));
}

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former ruby-overhang-scope-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertRubyOverhangScope(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { build } = smokeDependencyBundler;
    const { mkdirSync, readFileSync, writeFileSync } = smokeDependencyFiles;
    const { default: path } = smokeDependencyPaths;
    const { chromium, webkit } = smokeDependencyBrowsers;
    const { assert, createSmokePaths } = smokeDependencyHarness;
// Cold, source-module fixture: real Chromium/WebKit geometry and the shipped
// annotation stylesheet, without parser/network work or a packaged app. Root
// class/stylesheet changes without a repaint or resize are outside this probe.

const paths = createSmokePaths(_sourceDir);
const out = path.join(paths.artifacts, 'ruby-overhang-scope');
mkdirSync(out, { recursive: true });
const built = await build({
    stdin: {
        contents: 'import { syncRubyEdgeOverhang } from "./src/reader/dom/ruby-overhang.ts"; globalThis.syncRubyScope = syncRubyEdgeOverhang;',
        resolveDir: paths.root, loader: 'ts',
    },
    bundle: true, format: 'iife', platform: 'browser', write: false,
});
const script = built.outputFiles[0].text;
const css = readFileSync(path.join(paths.root, 'src/reader/styles/reader-words-ocr.css'), 'utf8');
const word = '<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-has-furi"><ruby class="jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start jpdb-reader-ruby-at-end">間<rt class="jpdb-reader-furi">あいだ</rt></ruby></span>';
const html = `<main>${Array.from({ length: 200 }, (_, i) => `<p data-paragraph="${i}">の${word}で</p>`).join('')}
<p id="line-head" style="width:6.5em">あいうえおか${word}で</p></main>`;
const report = {};
for (const [name, engine] of [[_hostEngine, _hostEngine === 'webkit' ? webkit : chromium]]) {
    const browser = _hostBrowser;

        const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
        await page.setContent(`<!doctype html><html lang="ja"><head><style>body{margin:24px;font:20px/1.9 serif}p{margin:0}</style></head><body>${html}</body></html>`);
        await page.addStyleTag({ content: css });
        await page.addScriptTag({ content: script });
        const measured = await page.evaluate(async () => {
            const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const original = Range.prototype.getClientRects;
            let reads = 0;
            Range.prototype.getClientRects = function (...args) { reads++; return original.apply(this, args); };
            try {
                const words = [...document.querySelectorAll('.jpdb-reader-word')];
                const start = performance.now();
                globalThis.syncRubyScope(words);
                await settle();
                const cold = { reads, elapsedMs: performance.now() - start };
                const edge = document.querySelector('#line-head ruby');
                const range = document.createRange();
                range.selectNodeContents(edge.querySelector('rt'));
                const lineEdge = {
                    guarded: edge.classList.contains('jpdb-reader-ruby-line-edge'),
                    left: range.getBoundingClientRect().left,
                    columnLeft: document.querySelector('#line-head').getBoundingClientRect().left,
                };
                reads = 0;
                words[5].querySelector('rt').textContent = 'ながいよみ';
                globalThis.syncRubyScope([words[5]]);
                await settle();
                const singleUpdateReads = reads;
                // A mode-wide repaint still checks every current paragraph.
                reads = 0;
                globalThis.syncRubyScope(words);
                await settle();
                const modeUpdateReads = reads;
                words[0].closest('p').remove();
                reads = 0;
                globalThis.syncRubyScope([words[0], words[5]]);
                await settle();
                const afterRemovalReads = reads;
                reads = 0;
                window.dispatchEvent(new Event('resize'));
                await settle();
                return { cold, lineEdge, singleUpdateReads, modeUpdateReads, afterRemovalReads, resizeReads: reads };
            } finally { Range.prototype.getClientRects = original; }
        });
        report[name] = measured;
        assert(measured.singleUpdateReads === 4, `${name}: one word update measured unrelated paragraphs`, measured);
        assert(measured.modeUpdateReads === measured.cold.reads, `${name}: a mode-wide repaint missed readings`, measured);
        assert(measured.afterRemovalReads === 4, `${name}: removed roots added geometry work`, measured);
        assert(measured.resizeReads === measured.cold.reads - 4, `${name}: resize did not recheck all live roots`, measured);
        assert(measured.lineEdge.guarded && measured.lineEdge.left >= measured.lineEdge.columnLeft - 0.5,
            `${name}: a line-head reading overhangs its column`, measured);
        await page.locator('#line-head').screenshot({ path: path.join(out, `${name}-line-head.png`) });

}
writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Ruby paragraph-scope smoke passed; source fixture report: ${out}`);

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
