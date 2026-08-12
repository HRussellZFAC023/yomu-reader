#!/usr/bin/env node
// Real-engine regression: a paused-video OCR line must be rendered ON the words it was
// read from — including the bottom strip of the picture, where burned-in subtitles live.
//
// The defect this exists to catch shipped: a "keep clear of the native control strip"
// bottom inset (64px) was applied to EVERY YouTube paused-frame overlay, so the clamp
// that is meant to keep a line inside the picture instead lifted any line near the bottom
// edge out of register — 70px above its own glyphs on the reported screenshot. Subtitles
// are the single most common thing a reader OCRs on YouTube, so the one band the inset
// protected is the one band the text is in.
//
// The fixture is literal about the production contract:
//   * A real <video> inside YouTube's own player markup, on www.youtube.com, paused —
//     the defect was host-gated and only reachable through the paused-frame path.
//   * The captured frame is a canvas with real Japanese type painted on it, so the source
//     is glyphs rather than a rectangle standing in for glyphs.
//   * The box handed to the overlay is THAT TEXT'S OWN INK BOX from ctx.measureText,
//     which is what Google Lens and Cloud Vision return for a line.
//   * The renderer is the shipped ImageOcrController, bundled from source, so a bad edit
//     fails here without needing a build first. jsdom cannot answer this: it does not lay
//     text out, so the fitted frame it reports is arithmetic on zero-sized boxes.
//
// Three cells: a subtitle in the bottom strip (the regression), a line in the middle of
// the frame (control — never displaced, so a pass proves the fixture measures register
// rather than luck), and a line whose ink runs into the last rows of the picture (the
// frame edge must still clamp it inside).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTIFACT_DIR = path.join(ROOT, 'artifacts', 'youtube-paused-frame-register');

const SENTENCE = '聞こえ方として細かく見ても違いあるのか？';
const FRAME_WIDTH = 960;
const FRAME_HEIGHT = 540;
const FRAME_LEFT = 160;
const FRAME_TOP = 40;
const FONT_PX = 34;
// Baseline of the painted line, in frame pixels. 'subtitle' is where a burned-in caption
// sits (inside the old 64px inset), 'middle' is the untouched control, 'flush' runs the
// ink into the last rows of the picture.
const BASELINES = { subtitle: 508, middle: 270, flush: 536 };

// The highlight carries its own padding below the source glyphs (max(3, underline bleed)),
// so a few px of overhang is the design. The defect was 70px of LIFT.
const MAX_LIFT_PX = 8;
const MAX_OVERHANG_PX = 16;
const MIN_VERTICAL_OVERLAP = 0.6;
const MAX_CENTER_OFFSET_PX = 16;

const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-yt-frame-register-'));
let css = '';
let bundle = '';
try {
    const cssOut = path.join(workspace, 'yomu.css');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
        env: { ...process.env, YOMU_READER_CSS_OUT: cssOut, YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css') },
        stdio: 'pipe',
    });
    css = readFileSync(cssOut, 'utf8');

    const entry = path.join(workspace, 'entry.ts');
    const out = path.join(workspace, 'bundle.js');
    const controllerPath = path.join(ROOT, 'src', 'reader', 'ocr', 'controller').replaceAll('\\', '/');
    const privateRasterPath = path.join(ROOT, 'src', 'reader', 'ocr', 'private-raster-presenter').replaceAll('\\', '/');
    const settingsPath = path.join(ROOT, 'src', 'reader', 'settings', 'index').replaceAll('\\', '/');
    const videoFrameRequestPath = path.join(ROOT, 'src', 'reader', 'ocr', 'video-frame-request-bus').replaceAll('\\', '/');
    writeFileSync(entry, [
        `export { ImageOcrController } from '${controllerPath}';`,
        `export { privateRasterImageForHost } from '${privateRasterPath}';`,
        `export { DEFAULT_SETTINGS } from '${settingsPath}';`,
        `export { requestManualVideoFrameOcr } from '${videoFrameRequestPath}';`,
        '',
    ].join('\n'));
    buildSync({
        absWorkingDir: ROOT,
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        globalName: 'YomuReaderOcr',
        platform: 'browser',
        outfile: out,
        logLevel: 'silent',
    });
    bundle = readFileSync(out, 'utf8');
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

// YouTube's own player markup around the video: the paused-frame path reads it to tell the
// main player from a feed thumbnail, and the removed inset was gated on this host.
function fixtureHtml(baseline) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}
html, body { margin: 0; background: #0f0f0f; overflow: hidden; }
#movie_player { position: fixed; left: ${FRAME_LEFT}px; top: ${FRAME_TOP}px; width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; }
#movie_player video { width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; background: #1b2430; }
/* The player's own control strip, drawn where YouTube draws it. The overlay paints above
   it, which is why yielding the band cost register without buying visibility. */
.ytp-chrome-bottom { position: absolute; left: 12px; right: 12px; bottom: 12px; height: 40px; background: rgba(0,0,0,0.5); }
</style></head><body>
<div id="movie_player" class="html5-video-player"><video id="player-video" preload="none"></video><div class="ytp-chrome-bottom"></div></div>
<script>${bundle}</script>
<script>
window.__register = (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = ${FRAME_WIDTH};
    canvas.height = ${FRAME_HEIGHT};
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1b2430';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '${FONT_PX}px "Hiragino Sans", "Noto Sans CJK JP", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    const centerX = canvas.width / 2;
    const baseline = ${baseline};
    ctx.fillText(${JSON.stringify(SENTENCE)}, centerX, baseline);
    const metrics = ctx.measureText(${JSON.stringify(SENTENCE)});
    // The line's own ink box, which is what a cloud OCR provider returns for a line.
    const ink = {
        left: centerX - metrics.actualBoundingBoxLeft,
        top: baseline - metrics.actualBoundingBoxAscent,
        width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
        height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    };
    const frameDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const video = document.getElementById('player-video');
    // A src-less <video> is already paused; the intrinsic size is what the content box
    // (and therefore the overlay's fractional geometry) is computed from.
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: ${FRAME_WIDTH} });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: ${FRAME_HEIGHT} });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });

    const settings = {
        ...YomuReaderOcr.DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        ocrEnabled: true,
        ocrShowTextOverlay: true,
        ocrVideoPauseFrames: true,
        ocrProvider: 'local-service',
        ocrEndpointUrl: 'http://127.0.0.1:7331/ocr',
        annotationsPaused: false,
    };
    const controller = new YomuReaderOcr.ImageOcrController({
        getSettings: () => settings,
        parseJapanese: async () => [],
        onToast: () => {},
        captureVideoFrame: () => frameDataUrl,
    });
    controller.init();

    // Page-authored media events are no longer OCR authority. Keep this forged pause in
    // the real-engine fixture so a future regression cannot reopen that public capability.
    video.dispatchEvent(new Event('pause'));
    if (document.querySelector('.jpdb-ocr-video-frame')) {
        throw new Error('an untrusted page event created a paused-frame snapshot');
    }
    // The subtitle rail calls this private same-realm request bus for an explicit scan.
    // It reaches the same paused-frame capture and register layout without teaching the
    // fixture (or a hostile page) to bypass the trusted-event boundary.
    YomuReaderOcr.requestManualVideoFrameOcr(video);

    const frameHost = document.querySelector('.jpdb-ocr-video-frame');
    if (!frameHost) throw new Error('paused-frame snapshot was not created');
    if (frameHost.shadowRoot || frameHost.hasAttribute('src')) {
        throw new Error('paused-frame raster escaped its closed presentation');
    }
    // Pixel bytes live on the image inside the closed shadow root. This accessor is
    // bundled only into the smoke fixture as its trusted test seam; ordinary DOM queries
    // can see the geometry host but cannot recover the raster source.
    const frame = YomuReaderOcr.privateRasterImageForHost(frameHost);
    if (!frame) throw new Error('paused-frame private raster was not created');
    // The inline OCR result must be readable when the snapshot finishes decoding, exactly
    // as a provider response would be by the time the overlay is built.
    frame.dataset.ocrLines = JSON.stringify([{ text: ${JSON.stringify(SENTENCE)}, box: ink, vertical: false }]);

    const deadline = Date.now() + 10000;
    while (!document.querySelector('.jpdb-ocr-line')) {
        if (Date.now() > deadline) throw new Error('no OCR line was rendered');
        await new Promise(resolve => setTimeout(resolve, 60));
    }
    await new Promise(resolve => setTimeout(resolve, 250)); // let the fitted layout settle

    const frameRect = frameHost.getBoundingClientRect();
    const line = document.querySelector('.jpdb-ocr-line').getBoundingClientRect();
    const source = {
        top: frameRect.top + ink.top,
        bottom: frameRect.top + ink.top + ink.height,
        centerX: frameRect.left + ink.left + ink.width / 2,
        height: ink.height,
    };
    const overlap = Math.max(0, Math.min(source.bottom, line.bottom) - Math.max(source.top, line.top));
    return {
        lift: source.bottom - line.bottom,
        overhang: line.bottom - source.bottom,
        verticalOverlap: overlap / source.height,
        centerOffset: Math.abs((line.left + line.width / 2) - source.centerX),
        insideFrame: line.bottom <= frameRect.bottom + 1 && line.top >= frameRect.top - 1,
    };
})();
</script></body></html>`;
}

async function measureCell(cell) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 620 }, locale: 'ja-JP', bypassCSP: true });
    const page = await context.newPage();
    try {
        await context.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
            if (new URL(url).hostname === 'www.youtube.com') {
                return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml(BASELINES[cell]) });
            }
            return route.fulfill({ status: 404, body: '' });
        });
        await page.goto('https://www.youtube.com/watch?v=yomu-register', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const measurement = await page.evaluate(() => window.__register);
        mkdirSync(ARTIFACT_DIR, { recursive: true });
        // An OCR line is transparent at rest (the words under it are the visible text), so
        // outline the measured box purely so the saved artifact shows what was measured.
        await page.addStyleTag({ content: '.jpdb-ocr-line { outline: 2px solid #ff3b6b !important; }' });
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${cell}.png`) });
        return measurement;
    } finally {
        await context.close();
        await browser.close();
    }
}

const failures = [];
const rows = [];
for (const cell of Object.keys(BASELINES)) {
    try {
        const m = await measureCell(cell);
        const reasons = [];
        if (m.lift > MAX_LIFT_PX) reasons.push(`lifted ${m.lift.toFixed(1)}px above its own glyphs`);
        if (m.overhang > MAX_OVERHANG_PX) reasons.push(`hangs ${m.overhang.toFixed(1)}px below its own glyphs`);
        if (m.verticalOverlap < MIN_VERTICAL_OVERLAP) reasons.push(`covers only ${(m.verticalOverlap * 100).toFixed(0)}% of the line height`);
        if (m.centerOffset > MAX_CENTER_OFFSET_PX) reasons.push(`off-centre by ${m.centerOffset.toFixed(1)}px`);
        if (!m.insideFrame) reasons.push('escaped the picture');
        const ok = reasons.length === 0;
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${cell} — lift ${m.lift.toFixed(1)}px, overlap ${(m.verticalOverlap * 100).toFixed(0)}%, centre ${m.centerOffset.toFixed(1)}px${ok ? '' : ` — ${reasons.join('; ')}`}`);
        if (!ok) failures.push(`${cell}: ${reasons.join('; ')}`);
        rows.push({ cell, ok, lift: m.lift });
    } catch (error) {
        console.log(`ERROR ${cell}: ${String(error).slice(0, 200)}`);
        failures.push(`${cell} crashed`);
    }
}

console.log('\n================ SUMMARY ================');
for (const row of rows) console.log(`${row.cell.padEnd(10)} ${row.ok ? 'in register' : 'OUT OF REGISTER'} (lift ${row.lift.toFixed(1)}px)`);
console.log(`screenshots: ${path.relative(ROOT, ARTIFACT_DIR)}`);
console.log(failures.length
    ? `\nFAILURES (${failures.length}): ${failures.join(' | ')}`
    : '\nALL PASS — paused-frame OCR sits on the text it was read from, bottom subtitles included');
process.exit(failures.length ? 1 : 0);
