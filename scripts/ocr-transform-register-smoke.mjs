#!/usr/bin/env node
// A23.1, in a real engine. Recognized text has to sit on the glyphs it was read from when
// the picture underneath it is ROTATED, and it has to sit exactly where the shipped build
// put it when the picture is not.
//
// getBoundingClientRect answers the axis-aligned bounding box of a transformed element:
// 444.25 x 609.66 for the reported image, whose own layout box is 414 x 589. Sizing the
// OCR layer from that box stretches the line grid by 1.073 in x against 1.035 in y, so
// every reading drifts, and the drift is worst at the corners.
//
// The fixture measures against GROUND TRUTH rather than against itself:
//   * The picture is a canvas with real Japanese type painted on it, and each OCR box
//     handed to the overlay is that text's own ink box from ctx.measureText — which is
//     what Lens and Cloud Vision return for a line.
//   * The painted position of each line, after the transform, is read off a zero-size
//     probe pinned at the ink centre inside a box that carries the same transform. A
//     zero-size box has no bounding box to inflate, so its rect IS the mapped point.
//   * Both arithmetics run in the same page, over the same DOM, in the same frame: the
//     shipped one (layer = the measured rect, no transform) and the fixed one. So the
//     before and after numbers are a measurement, not two runs compared by hand.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// The reported element, to the pixel.
const ELEMENT_WIDTH = 414;
const ELEMENT_HEIGHT = 589;
const STAGE_LEFT = 220;
const STAGE_TOP = 130;
// Two intrinsic pixels per layout pixel, so the fractional box mapping is exercised
// rather than sitting at 1:1.
const SOURCE_SCALE = 2;
const ROTATIONS = [-3, 7, -18, 90];
// Lines at the corners and the middle: a bounding-box stretch is smallest at the centre of
// the picture and largest at its corners, so a fixture with one central line would have
// let the defect through.
// In INTRINSIC pixels of the picture, which is the space OCR providers answer in.
const LINES = [
    { text: '町の明かりが見えてきた', size: 68, x: 60, baseline: 180 },
    { text: 'そろそろ港へ行くよ', size: 60, x: 240, baseline: 620 },
    { text: '約束の場所で待つ', size: 88, x: 80, baseline: 1080 },
];
// What the defect costs, and what it may cost afterwards. The reported drift was ~20px on
// a 30.58px column. Half a pixel is float and sub-pixel layout; anything above that is the
// layer being in the wrong place.
const MAX_DRIFT_PX = 0.5;
const MIN_DEFECT_DRIFT_PX = 4;

const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-ocr-transform-'));
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
    writeFileSync(entry, 'export { composedOcrSurfaceTransform, imageContentBox, layoutOcrOverlayLines,'
        + " ocrOverlayLayerPlacement, paintedImageFrame } from '"
        + path.join(ROOT, 'src', 'reader', 'ocr', 'ocr-overlay-geometry').replaceAll('\\', '/') + "';\n");
    buildSync({
        absWorkingDir: ROOT,
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        globalName: 'YomuOcrGeometry',
        platform: 'browser',
        outfile: out,
        logLevel: 'silent',
    });
    bundle = readFileSync(out, 'utf8');
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: #10151d; height: 3000px; }
  #stage { position: fixed; left: ${STAGE_LEFT}px; top: ${STAGE_TOP}px;
    width: ${ELEMENT_WIDTH}px; height: ${ELEMENT_HEIGHT}px; }
  #surface, #truth { position: absolute; left: 0; top: 0;
    width: ${ELEMENT_WIDTH}px; height: ${ELEMENT_HEIGHT}px; }
  #truth { pointer-events: none; }
  .probe { position: absolute; width: 0; height: 0; }
</style></head>
<body><div id="stage"><img id="surface" alt=""><div id="truth"></div></div>
<script>${bundle}</script>
</body></html>`;

// The slack ocrLineWordAtPoint allows around a word (src/reader/app/dom-helpers.ts).
const WORD_HIT_SLACK_PX = 8;

const browser = await chromium.launch();
const failures = [];
const rows = [];
const consumerRows = [];
let upright;
try {
    const tab = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    await tab.setContent(page, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(installFixture, { lines: LINES, scale: SOURCE_SCALE, width: ELEMENT_WIDTH, height: ELEMENT_HEIGHT });

    upright = await tab.evaluate(measureRegister, { degrees: 0 });
    rows.push({ degrees: 0, ...upright });
    report(0, upright);
    judge(failures, 0, upright, upright);

    for (const degrees of ROTATIONS) {
        const measured = await tab.evaluate(measureRegister, { degrees });
        rows.push({ degrees, ...measured });
        report(degrees, measured);
        judge(failures, degrees, measured, upright);
    }

    // The same page under an ANCESTOR rotation, with the image itself untransformed: the
    // element the layer covers is not always the element carrying the transform.
    const ancestor = await tab.evaluate(measureRegister, { degrees: -6, onAncestor: true });
    rows.push({ degrees: -6, ancestor: true, ...ancestor });
    report(-6, ancestor, ' (rotation on an ancestor)');
    judge(failures, -6, ancestor, upright);

    // The layer is repositioned on every animation frame while the page scrolls. Scrolled
    // and unscrolled must both land, or the fix only holds at the top of the document.
    await tab.evaluate(() => window.scrollTo(0, 400));
    const scrolled = await tab.evaluate(measureRegister, { degrees: -3 });
    rows.push({ degrees: -3, scrolled: true, ...scrolled });
    report(-3, scrolled, ' (scrolled 400px)');
    judge(failures, -3, scrolled, upright);
    await tab.evaluate(() => window.scrollTo(0, 0));

    // Step 4 of the ticket: once the layer is rotated, anything positioning UI from a
    // line's (or a word's) getBoundingClientRect starts receiving a bounding box. The
    // suspects are the lookup popup, which anchors on popoverAnchorRect(word), and
    // ocrLineWordAtPoint, which picks the word under the pointer from word rects
    // expanded by 8px. Both are measured here rather than reasoned about.
    for (const degrees of [0, -3, -18, 90]) {
        const audit = await tab.evaluate(measureConsumers, { degrees, slack: WORD_HIT_SLACK_PX });
        console.log(`[ocr-consumers] ${degrees}deg: word anchor box grows by`
            + ` ${audit.maxGrowthX.toFixed(2)}px x ${audit.maxGrowthY.toFixed(2)}px (worst of ${audit.words} words)`
            + ` | ${audit.ambiguous}/${audit.words} points inside more than one word's expanded box`
            + ` | hit test picks the right word ${audit.correctHits}/${audit.words}`
            + ` | elementFromPoint agrees ${audit.pointerHits}/${audit.words}`);
        consumerRows.push({ degrees, ...audit });
    }
} finally {
    await browser.close();
}

console.log(`\n[ocr-transform] untransformed image: ${upright.identical}/${upright.lines.length} line boxes byte-identical`
    + ` between the shipped arithmetic and the fixed one`);
for (const row of rows) {
    const tag = row.ancestor ? 'ancestor ' : row.scrolled ? 'scrolled ' : '';
    console.log(`[ocr-transform] ${tag}${row.degrees}deg: bounding box ${row.rect.width.toFixed(2)} x ${row.rect.height.toFixed(2)}`
        + ` vs layout ${row.layout.width} x ${row.layout.height}`
        + ` | layer ${row.placement.width.toFixed(2)} x ${row.placement.height.toFixed(2)} ${row.placement.transform || 'no transform'}`
        + ` | drift shipped ${row.legacyDrift.toFixed(2)}px -> fixed ${row.fixedDrift.toFixed(2)}px`
        + ` | line rect inflation ${row.lineInflation.toFixed(3)}x`);
}

if (failures.length) {
    console.error('\n[ocr-transform] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log('\n[ocr-transform] PASS');

function report(degrees, measured, suffix = '') {
    for (const line of measured.lines) {
        console.log(`  ${degrees}deg${suffix} "${line.text}": painted centre (${line.truth.x.toFixed(2)}, ${line.truth.y.toFixed(2)})`
            + ` | shipped (${line.legacy.x.toFixed(2)}, ${line.legacy.y.toFixed(2)}) off by ${line.legacyDrift.toFixed(2)}px`
            + ` | fixed (${line.fixed.x.toFixed(2)}, ${line.fixed.y.toFixed(2)}) off by ${line.fixedDrift.toFixed(2)}px`);
    }
}

function judge(failures, degrees, measured, upright) {
    if (degrees === 0) {
        // NON-NEGOTIABLE: an untransformed image must not move by a pixel, so the two
        // arithmetics are compared as the strings that get written to the element.
        if (measured.identical !== measured.lines.length) {
            failures.push(`0deg: ${measured.lines.length - measured.identical} line boxes moved on an untransformed image`);
        }
        if (measured.placementIdentical !== true) {
            failures.push(`0deg: the layer box itself moved on an untransformed image: ${JSON.stringify(measured.placement)}`);
        }
        return;
    }
    if (measured.legacyDrift - upright.fixedDrift < MIN_DEFECT_DRIFT_PX) {
        failures.push(`${degrees}deg: the fixture no longer reproduces the defect`
            + ` (shipped arithmetic only ${measured.legacyDrift.toFixed(2)}px off against a ${upright.fixedDrift.toFixed(2)}px`
            + ` upright floor), so it proves nothing`);
    }
    // The strict claim, free of the fixture's own font-metric noise: every line has to land
    // where the UPRIGHT layer put it, carried through the transform. Anything else means the
    // layer is in the wrong place or the wrong size.
    const { a, b, c, d } = measured.linear;
    for (const [index, local] of upright.localCentres.entries()) {
        const expectedX = measured.placement.left + a * local.x + c * local.y;
        const expectedY = measured.placement.top + b * local.x + d * local.y;
        const line = measured.lines[index];
        const off = Math.hypot(line.fixed.x - expectedX, line.fixed.y - expectedY);
        if (off > MAX_DRIFT_PX) {
            failures.push(`${degrees}deg "${line.text}": rotated layer puts the line ${off.toFixed(2)}px away from where`
                + ` the upright layer put it, mapped through the same transform`);
        }
    }
}

// Paint the picture, remember each line's ink box, and pin a zero-size probe at each ink
// centre inside a box that will carry the same transform as the picture.
function installFixture({ lines, scale, width, height }) {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f7fbff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111820';
    const boxes = [];
    for (const line of lines) {
        context.font = `700 ${line.size}px "Hiragino Sans", "Noto Sans CJK JP", sans-serif`;
        const metrics = context.measureText(line.text);
        const ascent = metrics.actualBoundingBoxAscent;
        const descent = metrics.actualBoundingBoxDescent;
        context.fillText(line.text, line.x, line.baseline);
        boxes.push({
            text: line.text,
            left: line.x,
            top: line.baseline - ascent,
            width: metrics.width,
            height: ascent + descent,
        });
    }
    const surface = document.getElementById('surface');
    surface.src = canvas.toDataURL('image/png');
    const truth = document.getElementById('truth');
    truth.replaceChildren(...boxes.map(box => {
        const probe = document.createElement('div');
        probe.className = 'probe';
        // Element coordinates: the picture is drawn at `scale` intrinsic pixels per
        // layout pixel and fills the element.
        probe.style.left = `${(box.left + box.width / 2) / scale}px`;
        probe.style.top = `${(box.top + box.height / 2) / scale}px`;
        truth.append(probe);
        return probe;
    }));

    const layer = document.createElement('div');
    layer.className = 'jpdb-ocr-layer';
    layer.dataset.ocrOverlayTheme = 'light';
    for (const box of boxes) {
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-visible';
        line.dataset.ocrText = box.text;
        line.dataset.vertical = 'false';
        line.dataset.boxLeft = String(box.left / canvas.width);
        line.dataset.boxTop = String(box.top / canvas.height);
        line.dataset.boxWidth = String(box.width / canvas.width);
        line.dataset.boxHeight = String(box.height / canvas.height);
        const text = document.createElement('span');
        text.className = 'jpdb-ocr-line-text';
        text.lang = 'ja';
        text.textContent = box.text;
        line.append(text);
        layer.append(line);
    }
    document.body.append(layer);
    window.__fixture = { boxes, canvasWidth: canvas.width, canvasHeight: canvas.height, scale };
    return new Promise(resolve => {
        if (surface.complete) resolve(true);
        else surface.addEventListener('load', () => resolve(true), { once: true });
    });
}

// Run BOTH arithmetics over the same DOM and measure each against the painted glyphs.
function measureRegister({ degrees, onAncestor = false }) {
    const { composedOcrSurfaceTransform, imageContentBox, layoutOcrOverlayLines, ocrOverlayLayerPlacement, paintedImageFrame } =
        window.YomuOcrGeometry;
    const fixture = window.__fixture;
    const surface = document.getElementById('surface');
    const truth = document.getElementById('truth');
    const stage = document.getElementById('stage');
    const layer = document.querySelector('.jpdb-ocr-layer');
    const transform = degrees ? `rotate(${degrees}deg)` : '';
    // The probe box must be transformed exactly as the picture is, whichever element
    // carries the transform.
    stage.style.transform = onAncestor ? transform : '';
    surface.style.transform = onAncestor ? '' : transform;
    truth.style.transform = onAncestor ? '' : transform;

    const frameFor = (rect, box) => {
        const style = getComputedStyle(surface);
        const content = imageContentBox(surface, box, style);
        return paintedImageFrame({
            image: surface,
            rect: box,
            style,
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
            sourceWidth: fixture.canvasWidth,
            sourceHeight: fixture.canvasHeight,
            content,
        });
    };

    const truthPoints = Array.from(truth.children).map(probe => {
        const rect = probe.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    });

    const rect = surface.getBoundingClientRect();
    const layout = { width: surface.offsetWidth, height: surface.offsetHeight };

    // 1. The shipped arithmetic: the layer IS the measured bounding box.
    const legacy = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, transform: '' };
    applyLayer(layer, legacy);
    layoutOcrOverlayLines(layer, frameFor(rect, rect), 1);
    const legacyCentres = lineCentres(layer);
    const legacyBoxes = lineBoxes(layer);

    // 2. The fixed arithmetic, straight out of the geometry module.
    const linear = composedOcrSurfaceTransform(surface, layer.parentElement, rect);
    const placement = ocrOverlayLayerPlacement(rect, linear, layout);
    applyLayer(layer, placement);
    const placedBox = placement.width === rect.width && placement.height === rect.height
        ? rect
        : { left: rect.left, top: rect.top, bottom: rect.bottom, width: placement.width, height: placement.height };
    layoutOcrOverlayLines(layer, frameFor(rect, placedBox), 1, placement.linear);
    const fixedCentres = lineCentres(layer);
    const fixedBoxes = lineBoxes(layer);
    const inflations = Array.from(layer.children).map(line => {
        const own = Number.parseFloat(line.style.width) || 1;
        return line.getBoundingClientRect().width / own;
    });

    const lines = truthPoints.map((point, index) => ({
        text: fixture.boxes[index].text,
        truth: point,
        legacy: legacyCentres[index],
        fixed: fixedCentres[index],
        legacyDrift: Math.hypot(legacyCentres[index].x - point.x, legacyCentres[index].y - point.y),
        fixedDrift: Math.hypot(fixedCentres[index].x - point.x, fixedCentres[index].y - point.y),
    }));
    return {
        rect: { width: rect.width, height: rect.height },
        layout,
        placement,
        linear,
        // With no transform on the layer, viewport minus the layer's origin IS the line's
        // position inside the layer — the reference the rotated runs are held to.
        localCentres: placement.transform
            ? null
            : fixedCentres.map(centre => ({ x: centre.x - placement.left, y: centre.y - placement.top })),
        placementIdentical: placement.left === rect.left && placement.top === rect.top
            && placement.width === rect.width && placement.height === rect.height && placement.transform === '',
        identical: legacyBoxes.filter((box, index) => box === fixedBoxes[index]).length,
        lines,
        legacyDrift: Math.max(...lines.map(line => line.legacyDrift)),
        fixedDrift: Math.max(...lines.map(line => line.fixedDrift)),
        lineInflation: Math.max(...inflations),
    };

    function applyLayer(element, box) {
        element.style.left = `${box.left}px`;
        element.style.top = `${box.top}px`;
        element.style.width = `${box.width}px`;
        element.style.height = `${box.height}px`;
        element.style.transform = box.transform;
        element.style.transformOrigin = box.transform ? '0 0' : '';
    }

    // The re-typeset glyphs are what has to sit on the painted glyphs, so the span is what
    // gets measured — not the line's padded hit box, whose centre is offset from the ink by
    // the padding and the baseline alignment.
    //
    // The bounding box of an affinely transformed box is centred on that box's own centre,
    // so this reads the painted centre even while the layer is rotated.
    function lineCentres(element) {
        return Array.from(element.children).map(line => {
            const box = line.querySelector('.jpdb-ocr-line-text').getBoundingClientRect();
            return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        });
    }

    function lineBoxes(element) {
        return Array.from(element.children).map(line => `${line.style.left}|${line.style.top}|${line.style.width}|${line.style.height}`);
    }
}

// The reader annotates every line it recognizes, so the elements consumers actually anchor
// on are the .jpdb-reader-word spans inside a line. This builds that state and measures
// what each consumer's rule answers while the layer is rotated.
function measureConsumers({ degrees, slack }) {
    const { composedOcrSurfaceTransform, imageContentBox, layoutOcrOverlayLines, ocrOverlayLayerPlacement, paintedImageFrame } =
        window.YomuOcrGeometry;
    const fixture = window.__fixture;
    const surface = document.getElementById('surface');
    const layer = document.querySelector('.jpdb-ocr-layer');
    document.getElementById('stage').style.transform = '';
    surface.style.transform = degrees ? `rotate(${degrees}deg)` : '';

    const line = layer.children[0];
    const text = line.querySelector('.jpdb-ocr-line-text');
    if (!text.querySelector('.jpdb-reader-word')) {
        text.replaceChildren(...[...text.textContent].map((character, index) => {
            const word = document.createElement('span');
            word.className = 'jpdb-reader-word';
            word.dataset.vid = String(1000 + index);
            word.dataset.sid = String(index);
            word.textContent = character;
            return word;
        }));
    }

    const rect = surface.getBoundingClientRect();
    const linear = composedOcrSurfaceTransform(surface, layer.parentElement, rect);
    const placement = ocrOverlayLayerPlacement(rect, linear, { width: surface.offsetWidth, height: surface.offsetHeight });
    layer.style.left = `${placement.left}px`;
    layer.style.top = `${placement.top}px`;
    layer.style.width = `${placement.width}px`;
    layer.style.height = `${placement.height}px`;
    layer.style.transform = placement.transform;
    layer.style.transformOrigin = placement.transform ? '0 0' : '';
    const style = getComputedStyle(surface);
    const placedBox = placement.transform
        ? { left: rect.left, top: rect.top, bottom: rect.bottom, width: placement.width, height: placement.height }
        : rect;
    layoutOcrOverlayLines(layer, paintedImageFrame({
        image: surface,
        rect: placedBox,
        style,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        sourceWidth: fixture.canvasWidth,
        sourceHeight: fixture.canvasHeight,
    }), 1, placement.linear);

    const words = Array.from(line.querySelectorAll('.jpdb-reader-word[data-vid][data-sid]'));
    const boxes = words.map(word => {
        const box = word.getBoundingClientRect();
        // What the word measures in the layer's own space. A consumer reading the rect gets
        // the bounding box of that box once it is rotated: bigger numbers for the same word.
        const own = { width: word.offsetWidth, height: word.offsetHeight };
        return { box, own, centre: { x: box.left + box.width / 2, y: box.top + box.height / 2 } };
    });

    let correctHits = 0;
    let pointerHits = 0;
    let ambiguous = 0;
    let maxGrowthX = 0;
    let maxGrowthY = 0;
    for (const [index, entry] of boxes.entries()) {
        // dom-helpers.ts: the FIRST word whose rect, expanded by the slack, contains the point.
        const picked = boxes.findIndex(candidate => entry.centre.x >= candidate.box.left - slack
            && entry.centre.x <= candidate.box.right + slack
            && entry.centre.y >= candidate.box.top - slack
            && entry.centre.y <= candidate.box.bottom + slack);
        if (picked === index) correctHits += 1;
        const matches = boxes.filter(candidate => entry.centre.x >= candidate.box.left - slack
            && entry.centre.x <= candidate.box.right + slack
            && entry.centre.y >= candidate.box.top - slack
            && entry.centre.y <= candidate.box.bottom + slack).length;
        if (matches > 1) ambiguous += 1;
        const hit = document.elementFromPoint(entry.centre.x, entry.centre.y);
        if (hit && hit.closest('.jpdb-reader-word') === words[index]) pointerHits += 1;
        maxGrowthX = Math.max(maxGrowthX, entry.box.width - entry.own.width);
        maxGrowthY = Math.max(maxGrowthY, entry.box.height - entry.own.height);
    }
    return { words: boxes.length, correctHits, pointerHits, ambiguous, maxGrowthX, maxGrowthY };
}
