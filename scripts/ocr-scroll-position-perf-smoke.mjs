#!/usr/bin/env node
// A35.22 in a real engine: compare the old interleaved OCR scroll pass with the
// gather-then-apply path over the same BookWalker-shaped DOM.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMAGES = 24;
const ANCESTOR_DEPTH = 15;
const LINES_PER_IMAGE = 8;
const IMAGE_WIDTH = 414;
const IMAGE_HEIGHT = 589;
const COLUMNS = 3;
const ROUNDS = 21;
const MAX_BATCHED_SHARE_OF_INTERLEAVED = 0.35;
const MIN_VISIBLE_LAYERS = 4;
const SENTENCES = [
    '町の明かりが見えてきたから、そろそろ港へ行くよ。',
    '約束の場所で待っている。',
    '風が強くなってきた。',
    'この本はもう読んだことがある。',
    '駅の前で友達と会う予定だ。',
    '海の音がずっと聞こえていた。',
    '手紙はまだ届いていない。',
    '明日の朝、もう一度話そう。',
];

const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-ocr-perf-'));
let css = '';
let bundle = '';
try {
    const cssOut = path.join(workspace, 'yomu.css');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
        env: {
            ...process.env,
            YOMU_READER_CSS_OUT: cssOut,
            YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css'),
        },
        stdio: 'pipe',
    });
    css = readFileSync(cssOut, 'utf8');

    const geometry = path.join(ROOT, 'src', 'reader', 'ocr', 'ocr-overlay-geometry').replaceAll('\\', '/');
    const pass = path.join(ROOT, 'src', 'reader', 'ocr', 'ocr-position-pass').replaceAll('\\', '/');
    const entry = path.join(workspace, 'entry.ts');
    const out = path.join(workspace, 'bundle.js');
    writeFileSync(entry, [
        `export { composedOcrSurfaceTransform, imageContentBox, layoutOcrOverlayLines,`
            + ` ocrOverlayLayerPlacement, paintedImageFrame } from '${geometry}';`,
        `export { ocrPlacedSurfaceRect, positionOcrSurfaces, setOcrArtifactPosition,`
            + ` setOcrLayerTransform, setOcrOverlayAccessibility } from '${pass}';`,
        '',
    ].join('\n'));
    buildSync({
        absWorkingDir: ROOT,
        entryPoints: [entry],
        bundle: true,
        format: 'iife',
        globalName: 'YomuOcrPass',
        platform: 'browser',
        outfile: out,
        logLevel: 'silent',
    });
    bundle = readFileSync(out, 'utf8');
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: #10151d; }
  .pages { position: absolute; inset: 0 auto auto 0; display: flex; flex-wrap: wrap;
    width: ${COLUMNS * (IMAGE_WIDTH + 20)}px; margin-left: calc((100vw - ${COLUMNS * (IMAGE_WIDTH + 20)}px) / 2); }
  .page { position: relative; margin: 0 10px 40px; width: ${IMAGE_WIDTH}px; height: ${IMAGE_HEIGHT}px; }
  .wrap { position: relative; width: 100%; height: 100%; }
  .wrap.shifted { transform: translate3d(0, 0, 0); }
  .page img { display: block; width: ${IMAGE_WIDTH}px; height: ${IMAGE_HEIGHT}px; background: #223; }
</style></head><body><script>${bundle}</script></body></html>`;

const browser = await chromium.launch();
let measured;
try {
    const tab = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    await tab.setContent(html, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(installFixture, {
        images: IMAGES,
        depth: ANCESTOR_DEPTH,
        lines: LINES_PER_IMAGE,
        sentences: SENTENCES,
    });
    measured = await tab.evaluate(measurePasses, { rounds: ROUNDS });
} finally {
    await browser.close();
}

const { interleaved, batched, counts, visible } = measured;
const share = batched.median / interleaved.median;
const savedStyles = counts.interleaved.computedStyle - counts.batched.computedStyle;
const savedRects = counts.interleaved.rects - counts.batched.rects;
console.log(`[ocr-scroll-perf] ${IMAGES} recognized images at ancestor depth ${ANCESTOR_DEPTH},`
    + ` ${LINES_PER_IMAGE} lines each, ${visible} layers visible, Chromium, ${ROUNDS} alternating rounds`);
console.log(`[ocr-scroll-perf] interleaved (pre-A35.22): median ${interleaved.median.toFixed(3)}ms/frame`
    + ` (min ${interleaved.min.toFixed(3)}, max ${interleaved.max.toFixed(3)})`);
console.log(`[ocr-scroll-perf] batched (shipped):        median ${batched.median.toFixed(3)}ms/frame`
    + ` (min ${batched.min.toFixed(3)}, max ${batched.max.toFixed(3)})`);
console.log(`[ocr-scroll-perf] batched costs ${(100 * share).toFixed(1)}% of interleaved`
    + ` — ${(interleaved.median / batched.median).toFixed(2)}x faster,`
    + ` ${(interleaved.median - batched.median).toFixed(3)}ms/frame back`);
console.log(`[ocr-scroll-perf] per frame: getComputedStyle ${counts.interleaved.computedStyle}`
    + ` -> ${counts.batched.computedStyle} (${savedStyles} fewer),`
    + ` getBoundingClientRect ${counts.interleaved.rects} -> ${counts.batched.rects} (${savedRects} fewer)`);

const failures = [];
if (!(share <= MAX_BATCHED_SHARE_OF_INTERLEAVED)) {
    failures.push(`batched cost ${(100 * share).toFixed(1)}% exceeds the`
        + ` ${(100 * MAX_BATCHED_SHARE_OF_INTERLEAVED).toFixed(0)}% ceiling`);
}
if (savedStyles < visible * (ANCESTOR_DEPTH - 1)) {
    failures.push(`only ${savedStyles} computed-style reads removed`);
}
if (savedRects < visible * LINES_PER_IMAGE) {
    failures.push(`only ${savedRects} rect reads removed`);
}
if (visible < MIN_VISIBLE_LAYERS) {
    failures.push(`only ${visible} layers visible`);
}
if (failures.length) {
    console.error('\n[ocr-scroll-perf] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log('\n[ocr-scroll-perf] PASS');

function installFixture({ images, depth, lines, sentences }) {
    const buildSurfaceSet = id => {
        const pages = document.createElement('div');
        pages.className = 'pages';
        pages.dataset.fixture = id;
        document.body.append(pages);
        const surfaces = [];
        for (let index = 0; index < images; index += 1) {
            const page = document.createElement('div');
            page.className = 'page';
            let host = page;
            for (let level = 0; level < depth; level += 1) {
                const wrap = document.createElement('div');
                wrap.className = level === Math.floor(depth / 2) ? 'wrap shifted' : 'wrap';
                host.append(wrap);
                host = wrap;
            }
            const image = document.createElement('img');
            image.alt = '';
            image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            host.append(image);
            pages.append(page);

            const overlay = document.createElement('div');
            overlay.className = 'jpdb-ocr-layer';
            overlay.dataset.ocrOverlayTheme = 'light';
            overlay.dataset.ocrLayerId = `${id}-${index + 1}`;
            for (let line = 0; line < lines; line += 1) {
                const element = document.createElement('div');
                element.className = 'jpdb-ocr-line jpdb-ocr-line-visible';
                const text = sentences[line % sentences.length];
                element.dataset.ocrText = text;
                element.dataset.vertical = 'false';
                element.dataset.boxLeft = '0.06';
                element.dataset.boxTop = String(0.05 + line * (0.9 / lines));
                element.dataset.boxWidth = '0.88';
                element.dataset.boxHeight = String(0.7 / lines);
                const span = document.createElement('span');
                span.className = 'jpdb-ocr-line-text';
                span.lang = 'ja';
                span.textContent = text;
                element.append(span);
                overlay.append(element);
            }
            document.body.append(overlay);
            surfaces.push({ image, overlay });
        }
        return surfaces;
    };
    const spacer = document.createElement('div');
    spacer.style.height = `${Math.ceil(images / 3) * (589 + 40)}px`;
    document.body.append(spacer);
    window.__ocrFixture = {
        interleavedSurfaces: buildSurfaceSet('interleaved'),
        batchedSurfaces: buildSurfaceSet('batched'),
    };
}

function measurePasses({ rounds }) {
    const {
        composedOcrSurfaceTransform,
        imageContentBox,
        layoutOcrOverlayLines,
        ocrOverlayLayerPlacement,
        ocrPlacedSurfaceRect,
        paintedImageFrame,
        positionOcrSurfaces,
        setOcrArtifactPosition,
        setOcrLayerTransform,
        setOcrOverlayAccessibility,
    } = window.YomuOcrPass;
    const { interleavedSurfaces, batchedSurfaces } = window.__ocrFixture;
    const sources = {
        sourceRect: () => undefined,
        isVisible: (_image, rect) =>
            rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight,
        transformSurface: image => image,
        renderedFrame: (image, rect) => {
            const style = getComputedStyle(image);
            const content = imageContentBox(image, rect, style);
            return paintedImageFrame({
                image,
                rect,
                style,
                objectFit: style.objectFit,
                objectPosition: style.objectPosition,
                sourceWidth: content.width,
                sourceHeight: content.height,
            });
        },
        fontScale: () => 1,
    };
    let nudged = 1;
    const interleavedPass = () => {
        nudged = nudged === 1 ? 1 + 1e-6 : 1;
        for (const { image, overlay } of interleavedSurfaces) {
            const rect = image.getBoundingClientRect();
            const visible = sources.isVisible(image, rect);
            overlay.hidden = !visible;
            setOcrOverlayAccessibility(overlay, visible);
            if (!visible) continue;
            const linear = composedOcrSurfaceTransform(image, overlay.parentElement, rect, true);
            const placement = ocrOverlayLayerPlacement(
                rect,
                linear,
                { width: image.offsetWidth, height: image.offsetHeight },
            );
            setOcrArtifactPosition(overlay, placement.left, placement.top);
            overlay.style.width = `${placement.width}px`;
            overlay.style.height = `${placement.height}px`;
            setOcrLayerTransform(overlay, placement.transform);
            layoutOcrOverlayLines(
                overlay,
                sources.renderedFrame(image, ocrPlacedSurfaceRect(rect, placement)),
                nudged,
                placement.linear,
            );
        }
    };
    const batchedPass = () => positionOcrSurfaces(batchedSurfaces, sources);
    for (let round = 0; round < 4; round += 1) {
        interleavedPass();
        batchedPass();
    }

    const scrollStep = 24;
    const framesPerSample = 20;
    const rewindIfNeeded = () => {
        if (window.scrollY + window.innerHeight + scrollStep * (framesPerSample + 2)
            >= document.body.scrollHeight) window.scrollTo(0, 0);
    };
    const time = pass => {
        rewindIfNeeded();
        const start = performance.now();
        for (let frame = 0; frame < framesPerSample; frame += 1) {
            window.scrollBy(0, scrollStep);
            pass();
        }
        return (performance.now() - start) / framesPerSample;
    };
    const interleavedTimes = [];
    const batchedTimes = [];
    for (let round = 0; round < rounds; round += 1) {
        interleavedTimes.push(time(interleavedPass));
        batchedTimes.push(time(batchedPass));
    }
    window.scrollTo(0, 0);

    const count = pass => {
        window.scrollBy(0, scrollStep);
        pass();
        void document.body.offsetHeight;
        const realStyle = window.getComputedStyle;
        const realRect = Element.prototype.getBoundingClientRect;
        let computedStyle = 0;
        let rects = 0;
        window.getComputedStyle = function (...args) {
            computedStyle += 1;
            return realStyle.apply(window, args);
        };
        Element.prototype.getBoundingClientRect = function (...args) {
            rects += 1;
            return realRect.apply(this, args);
        };
        try {
            pass();
        } finally {
            window.getComputedStyle = realStyle;
            Element.prototype.getBoundingClientRect = realRect;
        }
        return { computedStyle, rects };
    };
    const counts = { interleaved: count(interleavedPass), batched: count(batchedPass) };
    return {
        interleaved: summarize(interleavedTimes),
        batched: summarize(batchedTimes),
        counts,
        visible: batchedSurfaces.filter(({ image }) =>
            sources.isVisible(image, image.getBoundingClientRect())).length,
    };

    function summarize(values) {
        const sorted = [...values].sort((left, right) => left - right);
        return {
            median: sorted[Math.floor(sorted.length / 2)],
            min: sorted[0],
            max: sorted[sorted.length - 1],
        };
    }
}
