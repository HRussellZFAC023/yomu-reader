import * as smokeDependencyProcesses from 'node:child_process';
import * as smokeDependencyFiles from 'node:fs';
import * as smokeDependencyOperatingSystem from 'node:os';
import * as smokeDependencyPaths from 'node:path';
import * as smokeDependencyUrls from 'node:url';
import * as smokeDependencyBundler from 'esbuild';
import * as smokeDependencyBrowsers from 'playwright';
import * as smokeDependencyAssertions from 'node:assert/strict';
import * as smokeDependencyPixels from 'sharp';
function finishCell(code) { if (code) throw new Error('Merged smoke cell failed with exit code ' + code); }

// Former ocr-transform-register-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertOcrTransformRegister(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine !== 'chromium') return;
const _sourceDir = new URL('..', import.meta.url).pathname;
    const { execFileSync } = smokeDependencyProcesses;
    const { mkdtempSync, readFileSync, rmSync, writeFileSync } = smokeDependencyFiles;
    const { tmpdir } = smokeDependencyOperatingSystem;
    const { default: path } = smokeDependencyPaths;
    const { fileURLToPath } = smokeDependencyUrls;
    const { buildSync } = smokeDependencyBundler;

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

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

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
        + " ocrOverlayLayerPlacement, paintedImageFrame, parseCssTransformLinear } from '"
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

const browser = _hostBrowser;
const failures = [];
const rows = [];
const consumerRows = [];
let upright;
let ancestorWalkCost;

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

    ancestorWalkCost = await tab.evaluate(measureAncestorWalkCost, { iterations: 20_000, rounds: 7 });

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
console.log(`[ocr-perf] untransformed ${ancestorWalkCost.depth}-ancestor chain in Chromium`
    + ` (${ancestorWalkCost.iterations.toLocaleString()} calls x ${ancestorWalkCost.rounds} rounds, median):`
    + ` full-chain walk ${ancestorWalkCost.walkUs.toFixed(3)}us/call`
    + ` vs removed rect-size early exit ${ancestorWalkCost.earlyExitUs.toFixed(3)}us/call`
    + ` (${ancestorWalkCost.deltaUs >= 0 ? '+' : ''}${ancestorWalkCost.deltaUs.toFixed(3)}us)`);

if (failures.length) {
    console.error('\n[ocr-transform] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    finishCell(1);
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

// The old report quoted a hot-path number without an instrument. Keep the comparison in
// the decisive Chromium smoke so a future report can be reproduced. The baseline is the
// removed rect-size early exit, including its computed-style parse and layout-size reads;
// the current side calls the production ancestor walk over a real six-level DOM chain.
function measureAncestorWalkCost({ iterations, rounds }) {
    const { composedOcrSurfaceTransform, parseCssTransformLinear } = window.YomuOcrGeometry;
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = '-2000px';
    root.style.top = '0';
    let parent = root;
    const depth = 6;
    // `root` is the first ancestor; add five more for six in total.
    for (let index = 1; index < depth; index += 1) {
        const next = document.createElement('div');
        parent.append(next);
        parent = next;
    }
    const surface = document.createElement('img');
    surface.style.width = '414px';
    surface.style.height = '589px';
    parent.append(surface);
    document.body.append(root);
    const rect = surface.getBoundingClientRect();

    const earlyExit = () => {
        const own = parseCssTransformLinear(getComputedStyle(surface).transform);
        if (own
            && Math.abs(own.a - 1) < 1e-6
            && Math.abs(own.d - 1) < 1e-6
            && Math.abs(own.b) < 1e-6
            && Math.abs(own.c) < 1e-6
            && Math.abs(rect.width - surface.offsetWidth) <= 1
            && Math.abs(rect.height - surface.offsetHeight) <= 1) return null;
        return composedOcrSurfaceTransform(surface, document.body, rect);
    };
    const walk = () => composedOcrSurfaceTransform(surface, document.body, rect);
    for (let index = 0; index < 2_000; index += 1) {
        earlyExit();
        walk();
    }

    const earlyExitSamples = [];
    const walkSamples = [];
    for (let round = 0; round < rounds; round += 1) {
        const order = round % 2 ? [[walk, walkSamples], [earlyExit, earlyExitSamples]]
            : [[earlyExit, earlyExitSamples], [walk, walkSamples]];
        for (const [operation, samples] of order) {
            const startedAt = performance.now();
            for (let index = 0; index < iterations; index += 1) operation();
            samples.push((performance.now() - startedAt) * 1000 / iterations);
        }
    }
    root.remove();
    const median = values => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
    const earlyExitUs = median(earlyExitSamples);
    const walkUs = median(walkSamples);
    return {
        depth,
        iterations,
        rounds,
        earlyExitUs,
        walkUs,
        deltaUs: walkUs - earlyExitUs,
    };
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

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former gaming-ocr-hit-target-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertGamingOcrHitTarget(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine !== 'chromium') return;
const _sourceDir = new URL('..', import.meta.url).pathname;
    const { execFileSync } = smokeDependencyProcesses;
    const { mkdtempSync, readFileSync, rmSync, writeFileSync } = smokeDependencyFiles;
    const { tmpdir } = smokeDependencyOperatingSystem;
    const { default: path } = smokeDependencyPaths;
    const { fileURLToPath } = smokeDependencyUrls;
    const { buildSync } = smokeDependencyBundler;

// Deterministic geometry proof: expected hit boxes come from ORIGINAL provider pixels,
// never the replacement font or the rendered element being tested. No visible fixture UI.

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { css, bundle } = buildFixtureAssets();
const browser = _hostBrowser;
let cells = 0, points = 0;

    for (const deviceScaleFactor of [1, 1.25, 1.5, 2]) {
        for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 900 }]) {
            const context = await browser.newContext({ viewport, deviceScaleFactor });
            const page = await context.newPage();
            await page.setContent(`<style>${css}</style><body class="yomu-gaming-overlay-document"><main class="overlay-shell" data-capture-mode="instant"></main><script>${bundle}</script>`);
            for (const readings of [false, true]) {
                const result = await page.evaluate(measureProviderTargets, { readings });
                if (result.failures.length) throw new Error(`dpr ${deviceScaleFactor} ${viewport.width}x${viewport.height} readings=${readings}: ${JSON.stringify(result.failures)}`);
                cells += 1; points += result.points;
            }
            await context.close();
        }
    }

console.log(`[gaming-hit-target] ${cells} scale/viewport cells, ${points} ORIGINAL provider edge/center points hit their words; no duplicate glyph or background paint.`);

function measureProviderTargets({ readings }) {
    const api = window.YomuGamingOverlay;
    // The running Reader preserves generated source content for measurement even when
    // its fill is transparent. Reproduce that post-enrichment cascade, not empty glyphs.
    if (!document.querySelector('#source-glyph-measurement')) {
        const style = document.createElement('style'); style.id = 'source-glyph-measurement';
        style.textContent = 'body.yomu-gaming-overlay-document .overlay-inline-layer .jpdb-ocr-visual-text[data-yomu-ocr-visual-text]::before{content:attr(data-yomu-ocr-visual-text)!important}';
        document.head.append(style);
    }
    const sourceWidth = 960, sourceHeight = 540;
    const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
    const frame = { imageLeft: (innerWidth - sourceWidth * scale) / 2, imageTop: (innerHeight - sourceHeight * scale) / 2,
        imageWidth: sourceWidth * scale, imageHeight: sourceHeight * scale };
    const rows = [
        { text: '冒険を始めよう', vertical: false, box: {left: 120, top: 360, width: 176, height: 28}, words: [
            {text: '冒険', box: {left:120, top:360, width:20, height:28}},
            {text: 'を', box: {left:147, top:360, width:18, height:28}},
            {text: '始めよう', box: {left:204, top:360, width:92, height:28}},
        ] },
        { text: '日本語', vertical: true, box: {left: 820, top: 90, width: 28, height: 99}, words: [
            {text: '日本', box: {left:820, top:90, width:28, height:60}},
            {text: '語', box: {left:820, top:159, width:28, height:30}},
        ] },
        // Line-only local/cloud providers must retain usable, explicitly approximate targets.
        { text: '冒険へ', vertical: false, box: {left: 0, top: 0, width: 120, height: 30}, parts: ['冒険', 'へ'], expected: [
            {left:0, top:0, width:80, height:30}, {left:80, top:0, width:40, height:30},
        ] },
    ];
    const normalized = box => ({left:box.left/sourceWidth, top:box.top/sourceHeight, width:box.width/sourceWidth, height:box.height/sourceHeight});
    const root = document.querySelector('main');
    root.innerHTML = api.overlayNormalizedOcrLayerHtml(rows.map(row => ({ ...row, box: normalized(row.box),
        words: row.words?.map(word => ({...word, box:normalized(word.box)})) })));
    const failures = []; let points = 0;
    [...root.querySelectorAll('[data-ocr-line]')].forEach((line, index) => {
        const row = rows[index], text = line.querySelector('.jpdb-ocr-line-text');
        text.innerHTML = (row.parts ?? row.words.map(word => word.text)).map((part, wordIndex) =>
            `<span class="jpdb-reader-word jpdb-reader-scan-word${readings ? ' jpdb-reader-has-furi' : ''}" data-hit-word="${index}:${wordIndex}">${readings ? `<ruby><span class="jpdb-reader-ruby-base">${part}</span><rt>ことば</rt></ruby>` : part}</span>`).join('');
        api.normalizeOcrRenderedText(text, true);
    });
    api.layoutOverlayOcrLines(root, frame);
    if (readings) root.querySelectorAll('[data-ocr-line]').forEach(line => line.classList.add('jpdb-ocr-line-active'));
    if (readings && root.querySelectorAll('.jpdb-ocr-furi').length === 0) failures.push({missingReadings:true});
    [...root.querySelectorAll('[data-ocr-line]')].forEach((line, rowIndex) => {
        [...line.querySelectorAll('[data-hit-word]')].forEach((word, wordIndex) => {
            const expected = rows[rowIndex].expected?.[wordIndex] ?? rows[rowIndex].words[wordIndex].box;
            const rect = word.getBoundingClientRect();
            if (readings && [...word.querySelectorAll('*')].some(node => getComputedStyle(node).pointerEvents !== 'none'))
                failures.push({interactiveEnrichment:word.dataset.hitWord});
            const x = frame.imageLeft + expected.left * scale, y = frame.imageTop + expected.top * scale;
            const width = expected.width * scale, height = expected.height * scale;
            if (Math.max(Math.abs(rect.left-x),Math.abs(rect.top-y),Math.abs(rect.width-width),Math.abs(rect.height-height)) > 2)
                failures.push({word:word.dataset.hitWord, expected:{x,y,width,height},actual:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
            for (const dx of [0.15,0.5,0.85]) for (const dy of [0.15,0.5,0.85]) {
                points++;
                const hit = document.elementFromPoint(x + dx * width, y + dy * height);
                if (hit !== word && !word.contains(hit)) failures.push({word:word.dataset.hitWord,miss:{dx,dy},hit:hit?.className});
            }
        });
    });
    for (const node of root.querySelectorAll('.overlay-inline-layer, .overlay-inline-layer *')) {
        const style = getComputedStyle(node), clear = value => value === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(value);
        if (!clear(style.webkitTextFillColor) || !clear(style.backgroundColor) || style.backgroundImage !== 'none'
            || style.textShadow !== 'none' || ['::before','::after'].some(pseudo => { const p=getComputedStyle(node,pseudo); return !['none','normal'].includes(p.content) && (!clear(p.webkitTextFillColor) || !clear(p.backgroundColor) || p.backgroundImage !== 'none' || p.textShadow !== 'none'); }))
            failures.push({paintLeak:node.className});
    }
    return { points, failures };
}

function buildFixtureAssets() {
    const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-gaming-hit-target-'));
    try {
        const cssOut = path.join(workspace, 'yomu.css');
        execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
            env: { ...process.env, YOMU_READER_CSS_OUT: cssOut, YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css') },
            stdio: 'pipe',
        });
        const styles = readFileSync(cssOut, 'utf8')
            + '\n' + readFileSync(path.join(ROOT, 'src', 'gaming', 'renderer', 'styles.css'), 'utf8');
        const entry = path.join(workspace, 'entry.ts');
        const out = path.join(workspace, 'bundle.js');
        const source = relative => path.join(ROOT, 'src', ...relative.split('/')).replaceAll('\\', '/');
        writeFileSync(entry, [
            `export { overlayNormalizedOcrLayerHtml, layoutOverlayOcrLines } from '${source('gaming/renderer/ocr-lines')}';`,
            `export { normalizeOcrRenderedText } from '${source('reader/ocr/rendered-text')}';`,
        ].join('\n'));
        buildSync({
            absWorkingDir: ROOT,
            entryPoints: [entry],
            bundle: true,
            format: 'iife',
            globalName: 'YomuGamingOverlay',
            platform: 'browser',
            outfile: out,
            logLevel: 'silent',
        });
        return { css: styles, bundle: readFileSync(out, 'utf8') };
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
}

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former youtube-paused-frame-register-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertYoutubePausedFrameRegister(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine !== 'chromium') return;
const _sourceDir = new URL('..', import.meta.url).pathname;
    const { execFileSync } = smokeDependencyProcesses;
    const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = smokeDependencyFiles;
    const { tmpdir } = smokeDependencyOperatingSystem;
    const { default: path } = smokeDependencyPaths;
    const { fileURLToPath } = smokeDependencyUrls;
    const { buildSync } = smokeDependencyBundler;

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

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
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
    const browser = _hostBrowser;
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
finishCell(failures.length ? 1 : 0);

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former ocr-viewport-scroll-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertOcrViewportScroll(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { default: assert } = smokeDependencyAssertions;
    const { default: sharp } = smokeDependencyPixels;
    const { readFileSync } = smokeDependencyFiles;
    const { build } = smokeDependencyBundler;
    const { chromium, webkit } = smokeDependencyBrowsers;
// Behavioral fixture: real engines and production controllers/CSS; no OCR upload.
// A synchronous scroll probe runs before scroll handlers can repair geometry.
const bundle = await build({
    stdin: { contents: `export { ImageOcrController } from './src/reader/ocr/controller';
      export { FloatingButtonController } from './src/reader/ui/floating-button';
      export { DEFAULT_SETTINGS } from './src/reader/settings';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'YomuViewportFixture', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel:'silent',
});
const css = readFileSync('dist/yomu.css', 'utf8');
for (const pageZoom of [1, 1.6]) {
for (const [name, type] of [[_hostEngine, _hostEngine === 'webkit' ? webkit : chromium]]) {
    const browser = _hostBrowser;

        const page = await browser.newPage(pageZoom===1 ? {viewport:{width:390,height:700},hasTouch:true} : {viewport:{width:760,height:980},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
        await page.route('http*/**', route=>route.abort());
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', event=>{ if(event.type()==='error') console.error(event.text()); });
        await page.setContent(`${pageZoom===1 ? '' : '<meta name="viewport" content="width=475">'}<style>${css}</style><style>
          body { margin:0; padding-top:100px; min-height:2400px; }
          .media { position:relative; width:330px; height:260px; margin:0 30px; }
          img { position:absolute; width:330px; height:260px; }
          #backdrop { transform:scale(1.2); filter:blur(24px); opacity:.3; }
        </style><div class="media"><img id="backdrop"><img id="foreground"></div>`);
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => {
            const { DEFAULT_SETTINGS, ImageOcrController, FloatingButtonController } = window.YomuViewportFixture;
            const settings = { ...DEFAULT_SETTINGS, ocrEnabled:true, ocrAutoScanImages:true,
                ocrMinImageArea:1, ocrShowTextOverlay:true, ocrProvider:'google-lens', showFloatingButton:true };
            for (const image of document.images) {
                image.dataset.ocrLines = JSON.stringify([{ text:'日本語を読む', box:{ left:.1, top:.2, width:.7, height:.15 } }]);
                image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="660" height="520"><rect width="660" height="520" fill="white"/></svg>');
            }
            const ocr = new ImageOcrController({ getSettings:()=>settings, parseJapanese:async(text)=>{ window.ocrParses=(window.ocrParses??0)+1; return [{ card:{vid:1,sid:1,rid:0,spelling:text,reading:'にほんごをよむ',meanings:[{glosses:['read Japanese'],partOfSpeech:['n']}],frequencyRank:null,partOfSpeech:['n'],cardState:['not-in-deck'],pitchAccent:[],wordWithReading:null},start:0,end:text.length,length:text.length,rubies:[],pitchClass:'unknown',sentence:text }]; }, onToast:()=>{}, shouldAutoScan:()=>true });
            ocr.init();
            const puck = new FloatingButtonController();
            const no = () => {};
            // The whole FloatingButtonActions interface, built once for both mounts. This
            // plain-JS fixture is not typechecked: when W1-65 (86ca3dbb6) added dismissLookup,
            // the puck tap threw on the missing member and the menu never opened.
            window.puckActions = ocrMode => ({ dismissLookup:no, openSettings:no, openStudyPage:no, cyclePowerState:async()=>{},
                powerState:()=> 'on', toggleFurigana:async()=>{}, isPaused:()=>false,
                toggleOcrMode:no, ocrMode:()=> ocrMode, toggleAutoPlayAudio:async()=>{}, isAutoPlayAudioEnabled:()=>false,
                toggleJapaneseSiteLanguage:no, isYouTube:()=>false, toggleYoutubeFilter:no, isYoutubeFilterEnabled:()=>false,
                toggleAutoSubtitles:no, isAutoSubtitlesEnabled:()=>false, hasSubtitleVideo:()=>false });
            puck.install(settings, no, window.puckActions('auto'));
            window.fixtureCleanup = () => { ocr.destroy(); puck.destroy(); };
        });
        try { await page.locator('.jpdb-ocr-video-frame-status:not([hidden])').waitFor({timeout:5000}); } catch (error) {
            console.error(name, errors, await page.evaluate(()=>({images:[...document.images].map(e=>({naturalWidth:e.naturalWidth,attempt:e.dataset.ocrAttemptKey})),layers:[...document.querySelectorAll('.jpdb-ocr-layer')].map(e=>e.outerHTML)})));
            throw error;
        }
        await page.locator('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line').click();
        await page.locator('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line-text').waitFor();
        const before = await page.evaluate(() => {
            const dots = [...document.querySelectorAll('.jpdb-ocr-video-frame-status')].filter(e=>!e.hidden);
            const layers = [...document.querySelectorAll('.jpdb-ocr-layer')].filter(e=>!e.hidden);
            const image = document.querySelector('#foreground').getBoundingClientRect();
            return { dots:dots.length, layers:layers.length, offset:dots[0].getBoundingClientRect().top-image.top,
                text:layers[0].querySelector('.jpdb-ocr-line').dataset.ocrText, glyphTop:layers[0].querySelector('.jpdb-ocr-line-text').getBoundingClientRect().top-image.top,
                modes: [...dots,...layers].map(e=>getComputedStyle(e).position), height:document.documentElement.scrollHeight };
        });
        assert.equal(before.dots, 1, `${name}: blurred backdrop owns a duplicate dot`);
        assert(before.text.includes('日本語を読む'), `${name}: no rendered OCR glyphs`);
        assert.equal(before.layers, 1, `${name}: blurred backdrop owns duplicate text`);
        assert(before.modes.every(mode=>mode==='absolute'), `${name}: ordinary OCR is viewport tracked`);
        const shifted = await page.evaluate(() => {
            window.scrollTo(0, 180);
            const image = document.querySelector('#foreground').getBoundingClientRect();
            const dot = document.querySelector('.jpdb-ocr-video-frame-status:not([hidden])').getBoundingClientRect();
            const layer = document.querySelector('.jpdb-ocr-layer:not([hidden])').getBoundingClientRect();
            const glyph=document.querySelector('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line-text').getBoundingClientRect();
            return { glyphTop:glyph.top-image.top, dotOffset:dot.top-image.top, layerOffset:layer.top-image.top, height:document.documentElement.scrollHeight };
        });
        assert(Math.abs(shifted.dotOffset-before.offset)<.5, `${name}: dot drifts before scroll callback`);
        assert(Math.abs(shifted.layerOffset)<.5, `${name}: OCR text drifts before scroll callback`);
        assert(Math.abs(shifted.glyphTop-before.glyphTop)<.5, `${name}: rendered glyphs drift before scroll callback`);
        assert.equal(shifted.height, before.height, `${name}: overlay changes document extent`);
        const parseCount=await page.evaluate(()=>window.ocrParses);
        await page.waitForFunction(()=>!document.querySelector('.jpdb-ocr-video-frame-status'));
        await page.locator('#foreground').click({position:{x:300,y:200}});
        await page.waitForTimeout(100);
        const reused=await page.evaluate(()=>({parses:window.ocrParses,dots:document.querySelectorAll('.jpdb-ocr-video-frame-status').length}));
        assert.equal(reused.parses,parseCount, `${name}: tap re-parses scanned image`);
        assert.equal(reused.dots,0, `${name}: tap resurrects ready dot`);
        // Deterministic pinch metrics, since Playwright WebKit cannot drive a real iOS pinch.
        // Applying those metrics exercises the real rendering/containing block, not just arithmetic.
        await page.addStyleTag({content: '.jpdb-reader-puck-viewport > .jpdb-reader-fab { background:rgb(1,255,0)!important; opacity:1!important; border:0!important; box-shadow:none!important; transform:none!important; } .jpdb-reader-fab-state {display:none!important;}'});
        await paintPuck(page);
        const startPixels=await puckPixels(page);
        const fit=await page.evaluate(()=>outerWidth/innerWidth);
        const pinch = await page.evaluate(async () => {
            window.scrollTo(0,0);
            const button = document.querySelector('.jpdb-reader-fab');
            const raw=button.getBoundingClientRect();
            const startRatio=button.parentElement.getBoundingClientRect().width/button.parentElement.offsetWidth;
            const initialFit=outerWidth/innerWidth;
            const startScale=Math.abs(startRatio-1/initialFit)<Math.abs(startRatio-1)?initialFit:1;
            const start={x:raw.x*startScale,y:raw.y*startScale,width:raw.width*startScale,height:raw.height*startScale};
            const native=window.visualViewport;
            const fit=outerWidth/innerWidth;
            const visual = Object.assign(new EventTarget(), { width:innerWidth/2, height:(native?.height??innerHeight)/2, scale:fit*2, offsetLeft:35, offsetTop:60 });
            Object.defineProperty(window, 'visualViewport', { configurable:true, value:visual });
            // Remount so controller listeners own this fixture's event source.
            window.fixtureCleanup();
            const { FloatingButtonController, DEFAULT_SETTINGS } = window.YomuViewportFixture;
            const puck = new FloatingButtonController();
            puck.install({ ...DEFAULT_SETTINGS, showFloatingButton:true }, () => {}, window.puckActions('off'));
            await new Promise(requestAnimationFrame);
            const read = () => {
                const button=document.querySelector('.jpdb-reader-fab');
                const r=button.getBoundingClientRect();
                const plane=button.parentElement;
                const ratio=plane.getBoundingClientRect().width/plane.offsetWidth;
                const rectScale=Math.abs(ratio-1/(fit*2))<Math.abs(ratio-1)?fit*2:1;
                return { x:r.x*rectScale-visual.offsetLeft*fit*2, y:r.y*rectScale-visual.offsetTop*fit*2, width:r.width*rectScale, height:r.height*rectScale };
            };
            const zoomed = read();
            Object.assign(visual,{ offsetLeft:90,offsetTop:110 });
            visual.dispatchEvent(new Event('scroll'));
            await new Promise(requestAnimationFrame);
            const panned = read();
            window.pinchFixture={ visual,puck };
            return { start:{ x:start.x,y:start.y,width:start.width,height:start.height }, zoomed,panned, roots:document.querySelectorAll('.jpdb-reader-puck-viewport').length };
        });
        for (const key of ['x','y','width','height']) {
            assert(Math.abs(pinch.zoomed[key]-pinch.start[key])<=1, `${name}: pinch changes puck ${key}: ${JSON.stringify(pinch)}`);
            assert(Math.abs(pinch.panned[key]-pinch.start[key])<=1, `${name}: pan changes puck ${key}`);
        }
        await paintPuck(page);
        const pannedPixels=await puckPixels(page);
        for (const key of ['x','y','width','height']) {
            const rendered=['x','y'].includes(key) ? (pannedPixels[key]-({x:90,y:110}[key])*fit)*2 : pannedPixels[key]*2;
            assert(Math.abs(rendered-startPixels[key])<=2, `${name}: rendered puck pixels drift for ${key}`);
        }
        await page.mouse.click((pannedPixels.x+pannedPixels.width/2)/fit,(pannedPixels.y+pannedPixels.height/2)/fit);
        await page.locator('.jpdb-reader-fab-radial.is-open').waitFor({ timeout:10_000 }).catch(error => {
            throw new Error(`${name}: tapping the panned puck did not open its menu; page errors: ${JSON.stringify(errors)}`, { cause:error });
        });
        // WebKit can start a staggered transition after the first paint. Wait
        // for the animation lifecycle, then independently assert physical bounds.
        await page.waitForFunction(() => {
            const items=[...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
            return items.length>0 && items.every(item => item.getAnimations().every(animation => !animation.pending && animation.playState!=='running'));
        });
        const menu = await page.evaluate(() => {
            const v=window.pinchFixture.visual;
            const fit=outerWidth/innerWidth;
            const plane=document.querySelector('.jpdb-reader-puck-viewport');
            const ratio=plane.getBoundingClientRect().width/plane.offsetWidth;
                const rectScale=Math.abs(ratio-1/(fit*2))<Math.abs(ratio-1)?fit*2:1;
            return [...document.querySelectorAll('.jpdb-reader-fab-radial-item')].map(e=>{
                const r=e.getBoundingClientRect();
                const x=r.x*rectScale-v.offsetLeft*fit*2, y=r.y*rectScale-v.offsetTop*fit*2;
                const hit=document.elementFromPoint((r.x+r.width/2)*rectScale/(fit*2),(r.y+r.height/2)*rectScale/(fit*2));
                return {x,y,width:r.width*rectScale,height:r.height*rectScale,hit:hit?.closest('.jpdb-reader-fab-radial-item')===e};
            });
        });
        assert(menu.length>=5, `${name}: pinch menu did not open`);
        for (const item of menu) {
            assert(item.hit, `${name}: menu has an incorrect click target`);
            assert(item.width>=45 && item.width<=56, `${name}: pinch magnifies menu button: ${JSON.stringify(item)}`);
            assert(item.x>=0 && item.y>=0 && item.x+item.width<=startPixels.x+startPixels.width+15 && item.y+item.height<=startPixels.y+startPixels.height+15, `${name}: pinch menu leaves visible viewport`);
        }
        const cleanup = await page.evaluate(() => {
            const { visual,puck }=window.pinchFixture;
            visual.offsetLeft+=10;
            visual.dispatchEvent(new Event('scroll'));
            const closing=document.querySelector('.jpdb-reader-fab-radial')?.classList.contains('is-closing');
            puck.destroy();
            return { closing, roots:document.querySelectorAll('.jpdb-reader-puck-viewport').length, menus:document.querySelectorAll('.jpdb-reader-fab-radial').length };
        });
        assert(cleanup.closing, `${name}: menu remains open during pinch pan`);
        assert.equal(cleanup.roots,0, `${name}: puck viewport leaks after teardown`);
        assert.equal(cleanup.menus,0, `${name}: menu leaks after teardown`);
        const sheetVisibility = await page.evaluate(() => {
            const root=document.createElement('div');
            root.className='jpdb-subtitle-player jpdb-subtitle-fullscreen jpdb-subtitle-has-video-frame';
            root.innerHTML='<div class="jpdb-subtitle-text"><button class="jpdb-subtitle-drag-handle">Move</button></div><div class="jpdb-subtitle-rail"><button>Next</button></div>';
            document.body.append(root);
            document.documentElement.classList.add('jpdb-subtitle-yt-sheet-open');
            const covered=[...root.children].map(e=>getComputedStyle(e).display);
            document.documentElement.classList.remove('jpdb-subtitle-yt-sheet-open');
            const restored=[...root.children].map(e=>getComputedStyle(e).display);
            root.remove();
            return {covered,restored};
        });
        assert(sheetVisibility.covered.every(display=>display==='none'), `${name}: Shorts controls cover comments`);
        assert(sheetVisibility.restored.every(display=>display!=='none'), `${name}: Shorts controls fail to return`);
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`${name} page-fit=${pageZoom}: PASS one foreground OCR owner; synchronous scroll registration; rendered glyph scroll registration; pinch/pan puck and menu geometry/teardown`);

}

}

async function puckPixels(page) {
    const {data,info}=await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,top=info.height,right=-1,bottom=-1;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
        const i=(y*info.width+x)*4;
        if(data[i]<15&&data[i+1]>240&&data[i+2]<15) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y); }
    }
    if(right<left) console.error(await page.evaluate(()=>{const b=document.querySelector('.jpdb-reader-fab'),s=getComputedStyle(b);return {box:b.getBoundingClientRect().toJSON(),bg:s.backgroundColor,opacity:s.opacity,display:s.display,style:b.style.cssText}}));
    assert(right>=left,'Puck did not paint its fixture colour');
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

async function paintPuck(page) {
    await page.evaluate(()=>{
        const b=document.querySelector('.jpdb-reader-fab');
        for(const [key,value] of Object.entries({background:'rgb(1,255,0)',opacity:'1',border:'0', 'box-shadow':'none',transform:'none',transition:'none'})) b.style.setProperty(key,value,'important');
        b.querySelector('.jpdb-reader-fab-state').style.setProperty('display','none','important');
    });
}

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
