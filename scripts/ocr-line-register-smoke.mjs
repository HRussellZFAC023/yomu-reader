#!/usr/bin/env node
// Real-engine regression: recognized text must be rendered AT THE SIZE AND IN THE PLACE
// of the text it was read from. Not "a line exists", not "the line is wider than 40px" —
// the size and the horizontal extent, measured against the source glyphs themselves.
//
// This is the bar the owner set ("I am not happy with the spacing and alignment") and the
// one the jsdom suites structurally cannot check, because jsdom does not lay text out. The
// defect it exists to catch was measured on the shipped build: an OCR box drawn tightly
// around 46px game type produced a 24.5px overlay line — 0.533x the size of the text
// underneath it and, being centred, 215px inside the left edge of the source sentence.
//
// The fixture is deliberately literal about the production contract:
//   * The "game frame" is a CANVAS with real Japanese type painted on it at a known size,
//     so the source is glyphs rather than a rectangle standing in for glyphs.
//   * The OCR box handed to the overlay is THAT TEXT'S OWN INK BOX, taken from
//     ctx.measureText — which is what Google Lens and Cloud Vision return for a line.
//   * The render path is the shipped one: overlayOcrLayerHtml() + layoutOverlayOcrLines()
//     from src/gaming/renderer/ocr-lines.ts, over the reader's own stylesheet, bundled
//     from source so a bad edit fails here without needing a build first.
//
// Both writing modes are covered. Horizontal type is measured against a canvas ink box;
// a vertical column is measured against a real vertical-rl span, because canvas has no
// vertical writing mode and inventing one would be measuring the fixture, not the product.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// A full sentence, not a word: the reported defect is worst on long lines, where a
// centred undersized line covers only the middle of the source.
const SENTENCE = '町の明かりが見えてきたから、そろそろ港へ行くよ。';
const VERTICAL_SENTENCE = '読書の時間だ';

// The size the game drew its text at. 80px is included because the old 38px ceiling made
// anything above ~65px unreachable at ANY "Image text scale" setting.
const SOURCE_SIZES = [28, 46, 80];

// The reader's "Image text scale" setting. 1 must land on the source's own size; the ends
// of the range must move it proportionally rather than run into a hard ceiling.
const FONT_SCALES = [0.7, 1, 1.8];

// How far the rendered line may sit from the source, as a fraction of the source. These
// are not "a bit better than before" numbers: the width fit is exact arithmetic over
// full-width advances, so anything beyond a couple of percent means the fit is not
// running. Height is compared ink-to-ink and gets more room because the overlay renders
// in the reader's font, not the game's, and two CJK faces do not fill their em identically.
const MAX_SIZE_DRIFT = 0.06;
const MAX_WIDTH_DRIFT = 0.05;
const MAX_INK_HEIGHT_DRIFT = 0.1;
// How far either end of the rendered line may sit inside (or outside) the source line,
// as a fraction of the source line's own width. The reported defect measured 0.234 here.
const MAX_EDGE_DRIFT = 0.04;
// The recognized line must sit on the source's baseline, not float above or below it.
const MAX_BASELINE_DRIFT_EM = 0.12;

const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-ocr-register-'));
let css = '';
let bundle = '';
try {
    const cssOut = path.join(workspace, 'yomu.css');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
        env: { ...process.env, YOMU_READER_CSS_OUT: cssOut, YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css') },
        stdio: 'pipe',
    });
    css = readFileSync(cssOut, 'utf8');
    css += '\n' + readFileSync(path.join(ROOT, 'src', 'gaming', 'renderer', 'styles.css'), 'utf8');

    const entry = path.join(workspace, 'entry.ts');
    const out = path.join(workspace, 'bundle.js');
    writeFileSync(entry, "export { overlayOcrLayerHtml, layoutOverlayOcrLines } from '"
        + path.join(ROOT, 'src', 'gaming', 'renderer', 'ocr-lines').replaceAll('\\', '/') + "';\n");
    execFileSync(process.execPath, [
        path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'),
        entry,
        '--bundle',
        '--format=iife',
        '--global-name=YomuOcrOverlay',
        '--platform=browser',
        `--outfile=${out}`,
    ], { cwd: ROOT, stdio: 'pipe' });
    bundle = readFileSync(out, 'utf8');
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: #0b0e13; overflow: hidden; }
  #capture { position: fixed; left: 0; top: 0; }
  /* The game's own type: a face that is NOT the reader's, so the fit has to measure
     rather than assume both sides share metrics. */
  #vertical-source {
    position: fixed;
    font-family: "Hiragino Mincho ProN", "Noto Serif CJK JP", serif;
    font-weight: 700;
    line-height: 1;
    writing-mode: vertical-rl;
    white-space: nowrap;
    color: #f5faff;
  }
  .jpdb-ocr-layer { position: fixed; inset: 0; }
</style></head>
<body><canvas id="capture"></canvas><span id="vertical-source"></span>
<script>${bundle}</script>
</body></html>`;

const GAME_FONT = '"Hiragino Mincho ProN", "Noto Serif CJK JP", serif';

const browser = await chromium.launch();
const failures = [];
const rows = [];
try {
    const tab = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await tab.setContent(page, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);

    for (const sourceSize of SOURCE_SIZES) {
        for (const fontScale of FONT_SCALES) {
            const measured = await tab.evaluate(measureHorizontal, { sentence: SENTENCE, sourceSize, fontScale, gameFont: GAME_FONT });
            rows.push({ mode: 'horizontal', sourceSize, fontScale, ...measured });
            check(failures, `horizontal ${sourceSize}px x${fontScale}`, measured, fontScale);
        }
    }

    for (const sourceSize of SOURCE_SIZES) {
        const measured = await tab.evaluate(measureVertical, { sentence: VERTICAL_SENTENCE, sourceSize });
        rows.push({ mode: 'vertical', sourceSize, fontScale: 1, ...measured });
        // A vertical column is checked on size and on the length it spans; the "edges" of a
        // vertical line are its top and bottom, which the same edge drift covers.
        check(failures, `vertical ${sourceSize}px`, measured, 1);
    }
} finally {
    await browser.close();
}

for (const row of rows) {
    console.log(
        `[ocr-register] ${row.mode} source ${row.sourceSize}px x${row.fontScale}`
        + ` -> rendered ${row.renderedFontPx.toFixed(1)}px (${(row.renderedFontPx / (row.sourceSize * row.fontScale)).toFixed(3)}x)`
        + ` width ${row.widthRatio.toFixed(3)}x ink-height ${row.inkHeightRatio.toFixed(3)}x`
        + ` edges ${row.startDrift.toFixed(3)}/${row.endDrift.toFixed(3)} baseline ${row.baselineDriftEm.toFixed(3)}em`,
    );
}

if (failures.length) {
    for (const failure of failures) console.error(`[ocr-register] FAIL ${failure}`);
    process.exit(1);
}
console.log(`[ocr-register] OK — ${rows.length} cells in register with the text they were read from.`);

function check(sink, label, m, fontScale) {
    const expectedFontPx = m.sourceSize * fontScale;
    const drift = (value, target) => Math.abs(value - target) / target;
    if (drift(m.renderedFontPx, expectedFontPx) > MAX_SIZE_DRIFT) {
        sink.push(`${label}: rendered ${m.renderedFontPx.toFixed(1)}px against ${expectedFontPx.toFixed(1)}px of source type`
            + ` (${(m.renderedFontPx / expectedFontPx).toFixed(3)}x)`);
    }
    if (Math.abs(m.widthRatio - fontScale) / fontScale > MAX_WIDTH_DRIFT) {
        sink.push(`${label}: rendered line spans ${m.widthRatio.toFixed(3)}x the source line, expected ${fontScale}x`);
    }
    if (Math.abs(m.inkHeightRatio - fontScale) / fontScale > MAX_INK_HEIGHT_DRIFT) {
        sink.push(`${label}: rendered ink is ${m.inkHeightRatio.toFixed(3)}x as thick as the source ink, expected ${fontScale}x`);
    }
    // At scale 1 the line should cover the source line end to end. Away from 1 the user
    // asked for bigger or smaller type, so only the CENTRE is expected to agree.
    if (fontScale === 1) {
        if (Math.abs(m.startDrift) > MAX_EDGE_DRIFT) sink.push(`${label}: line starts ${(m.startDrift * 100).toFixed(1)}% of the source width in`);
        if (Math.abs(m.endDrift) > MAX_EDGE_DRIFT) sink.push(`${label}: line ends ${(m.endDrift * 100).toFixed(1)}% of the source width short`);
    }
    if (Math.abs(m.baselineDriftEm) > MAX_BASELINE_DRIFT_EM) {
        sink.push(`${label}: line sits ${m.baselineDriftEm.toFixed(3)}em off the source baseline`);
    }
}

// Runs in the page. Paints the sentence onto the capture canvas, hands the overlay that
// text's own ink box, and reports how the rendered line compares with it.
function measureHorizontal({ sentence, sourceSize, fontScale, gameFont }) {
    const canvas = document.getElementById('capture');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `700 ${sourceSize}px ${gameFont}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5faff';
    // Centred, so an 80px line still fits on the frame. A source line that ran off the
    // capture would be clamped back onto it by the layout — correct behaviour, but it
    // would be measuring the clamp instead of the fit.
    const originX = Math.max(24, Math.round((canvas.width - ctx.measureText(sentence).width) / 2));
    const baseline = 900;
    ctx.fillText(sentence, originX, baseline);
    const source = ctx.measureText(sentence);
    const box = {
        left: originX - source.actualBoundingBoxLeft,
        top: baseline - source.actualBoundingBoxAscent,
        width: source.actualBoundingBoxLeft + source.actualBoundingBoxRight,
        height: source.actualBoundingBoxAscent + source.actualBoundingBoxDescent,
    };

    const frame = { imageLeft: 0, imageTop: 0, imageWidth: canvas.width, imageHeight: canvas.height };
    document.querySelectorAll('.jpdb-ocr-layer').forEach(layer => layer.remove());
    document.body.insertAdjacentHTML('beforeend', window.YomuOcrOverlay.overlayOcrLayerHtml(
        [{ text: sentence, box, vertical: false }],
        frame,
    ));
    const layer = document.querySelector('.jpdb-ocr-layer');
    window.YomuOcrOverlay.layoutOverlayOcrLines(layer, frame, fontScale);

    const text = layer.querySelector('.jpdb-ocr-line-text');
    const rect = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    const renderedFontPx = Number.parseFloat(style.fontSize);
    // Ink against ink: the element's own box is a full em tall, the OCR box is only as
    // tall as the source's ink, so comparing those two directly would report an 8%
    // "error" that is pure definition. Re-measure the rendered line the same way the
    // source was measured.
    ctx.font = `${style.fontWeight} ${renderedFontPx}px ${style.fontFamily}`;
    const rendered = ctx.measureText(sentence);
    return {
        sourceSize,
        renderedFontPx,
        widthRatio: rect.width / box.width,
        inkHeightRatio: (rendered.actualBoundingBoxAscent + rendered.actualBoundingBoxDescent) / box.height,
        startDrift: (rect.left - box.left) / box.width,
        endDrift: (box.left + box.width - rect.right) / box.width,
        baselineDriftEm: (rect.bottom - (box.top + box.height)) / renderedFontPx,
    };
}

// The vertical equivalent. The source is a real vertical-rl span rather than a canvas,
// so the "ink box" here is the span's own line box with line-height 1 — the tightest
// honest box a provider could draw around an upright column.
function measureVertical({ sentence, sourceSize }) {
    const source = document.getElementById('vertical-source');
    source.textContent = sentence;
    source.style.fontSize = `${sourceSize}px`;
    source.style.left = '1500px';
    source.style.top = '90px';
    const sourceRect = source.getBoundingClientRect();
    const box = { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height };

    const frame = { imageLeft: 0, imageTop: 0, imageWidth: window.innerWidth, imageHeight: window.innerHeight };
    document.querySelectorAll('.jpdb-ocr-layer').forEach(layer => layer.remove());
    document.body.insertAdjacentHTML('beforeend', window.YomuOcrOverlay.overlayOcrLayerHtml(
        [{ text: sentence, box, vertical: true }],
        frame,
    ));
    const layer = document.querySelector('.jpdb-ocr-layer');
    window.YomuOcrOverlay.layoutOverlayOcrLines(layer, frame, 1);

    const text = layer.querySelector('.jpdb-ocr-line-text');
    const rect = text.getBoundingClientRect();
    const renderedFontPx = Number.parseFloat(getComputedStyle(text).fontSize);
    return {
        sourceSize,
        renderedFontPx,
        // A vertical line runs top to bottom, so its "width" is the length of the column.
        widthRatio: rect.height / box.height,
        inkHeightRatio: rect.width / box.width,
        startDrift: (rect.top - box.top) / box.height,
        endDrift: (box.top + box.height - rect.bottom) / box.height,
        baselineDriftEm: 0,
    };
}
