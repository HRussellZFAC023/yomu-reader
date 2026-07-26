#!/usr/bin/env node
// Real-engine regression: the legibility outline on a subtitle reading must be
// SIZE-INVARIANT in shape, it must stay off the kanji it annotates, AND it must
// keep the reading legible over bright footage IN EVERY DIRECTION.
//
// The reported bug was "kanji that carry furigana render darker than the
// okurigana beside them". It is not the highlight family — it reproduces with
// every highlight channel off. The cause is geometric:
//
//   * The clear space between the reading's ink and the kanji's ink is a
//     size-invariant fraction of the reading (~0.25em Blink, ~0.43em WebKit).
//   * The reading's outline used fixed pixel radii (0 1px 1px / 0 0 3px /
//     0 0 7px). 7px is 0.20em of the reading in a 60px cue but 0.43em in a 28px
//     cue and 0.60em in a 20px one, so the smaller the cue the further the dark
//     halo reached past the gap and onto the top of the kanji's band. Okurigana
//     carries no reading, so nothing washes it — hence the visible difference
//     WITHIN one word.
//
// The fixture is therefore 続ける: ONE word containing an annotated kanji and
// plain okurigana, which is the comparison the bug report actually makes. An
// earlier version of this file rendered a bare annotated 続 with no okurigana,
// so it could assert things about the kanji but never measure the difference
// the user sees.
//
// Three things are asserted, because fixing any one alone is a regression:
//
//   (i)   REACH — the outline's downward reach must stay inside the clear space
//         that band actually has, at every cue size. A fixed-pixel declaration
//         cannot satisfy this: its reach in pixels is the same on every cue
//         while the gap shrinks with the cue, so the ratio climbs until the halo
//         crosses into the kanji (measured 1.25x the whole gap at 20px and 28px
//         in both engines).
//   (ii)  WASH — in the half of that clear space ADJACENT TO THE KANJI, the
//         kanji's column must not be measurably darker than the okurigana's
//         column beside it. Both columns are sampled over rows that contain no
//         glyph ink in either, against a layout-identical control, so the number
//         is the reported comparison and nothing else.
//   (iii) LEGIBILITY — the reading's contrast over a BRIGHT, video-like backdrop
//         must not drop below what the owner-tuned build achieved, asserted PER
//         DIRECTION. A median or mean over directions is what let an interim fix
//         ship: it moved the outline's mass upward, so up rose 3.43 -> 11.76
//         while down fell 14.59 -> 4.96 at the default cue, and the middle of
//         those two barely moved. The reading sits above the caption line with
//         open video under it; the underside is exactly the edge that needs the
//         outline most.
//
// Both the wash and the reach measurement toggle ONLY the reading's own
// rendering over an otherwise identical DOM (`rt { visibility: hidden }`, which
// keeps the ruby annotation's layout box), so glyph positions, line box height
// and antialiasing phase cancel exactly rather than being estimated. The
// geometry check below fails the run if that ever stops being true.
//
// visibility is the only lever that works here, and deliberately so: the reader
// pins `.jpdb-reader-word rt.jpdb-reader-furi { display: ruby-text !important }`
// (src/reader/styles/index.ts) as host-CSS armour, so a display-based control is
// silently ignored in Blink and the whole comparison collapses to zero without
// anything failing. Hence the box check covers the reading's own box too.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Bundle the reader CSS from SOURCE rather than reading dist/yomu.css, so the
// smoke fails on a bad stylesheet edit without needing a build first (and never
// races a build another process is running).
const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-furi-outline-'));
let css;
try {
    const bundled = path.join(workspace, 'yomu.css');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
        env: { ...process.env, YOMU_READER_CSS_OUT: bundled, YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css') },
        stdio: 'pipe',
    });
    css = readFileSync(bundled, 'utf8');
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

// The product default is --subtitle-font-size-target: 28px; the fit loop and the
// user's size control move it either way, so the whole working range is checked.
const SIZES = [20, 28, 40, 60];

// The outline may spend at most this fraction of the clear space between the
// reading's ink and the kanji's ink. Stated as a fraction of the MEASURED gap
// rather than a flat em number for two reasons: it is the physically meaningful
// statement (the outline has to fit in the room it has), and the two engines lay
// ruby out differently (~0.25em of clear space in Blink, ~0.43em in WebKit), so
// a flat cap would be slack in one and tight in the other.
//
// This is the assertion a fixed-pixel radius cannot pass: the pre-fix build
// measured 1.25x at both 20px and 28px in both engines.
const MAX_REACH_OVER_GAP = 0.6;

// How much darker (0-255 luminance) the annotated kanji's column may be than the
// plain okurigana's column, in the half of the clear band that sits against the
// two glyphs. This IS the reported bug, stated as a number. The pre-fix build
// measured up to 5.52 here; a correct outline measures ~0.
const MAX_WASH_DIFFERENTIAL = 0.5;

// Per-direction glyph-vs-outline contrast the reading must still achieve over a
// bright frame, per engine and cue size. Every floor is the value the OWNER-
// TUNED pre-fix build (0 1px 1px / 0 0 3px / 0 0 7px) measured in that exact
// cell, so any change that spends legibility in any direction to buy the wash
// fix fails here — which is precisely what the interim fix did downward.
const LEGIBILITY_FLOOR = {
    chromium: {
        20: { up: 2.87, down: 11.29, left: 3.67, right: 4.36 },
        28: { up: 3.43, down: 14.59, left: 4.48, right: 5.59 },
        40: { up: 4.54, down: 14.55, left: 5.49, right: 7.23 },
        60: { up: 4.95, down: 14.94, left: 7.11, right: 9.15 },
    },
    webkit: {
        20: { up: 1.66, down: 3.25, left: 1.89, right: 3.21 },
        28: { up: 1.86, down: 4.42, left: 2.27, right: 3.36 },
        40: { up: 1.92, down: 6.39, left: 2.17, right: 5.92 },
        60: { up: 2.24, down: 12.27, left: 2.35, right: 13.01 },
    },
};

const BRIGHT_BACKDROP = '#ebebeb';
const VIDEO_BACKDROP = '#808080';

// Exactly what renderRuby emits for 続ける: an annotated kanji run followed by a
// bare okurigana text node, inside one subtitle word, inside the on-video cue's
// real container chain. The okurigana is deliberately NOT wrapped in a span —
// its column is located with a Range, so the control column is untouched
// product markup rather than a probe the stylesheet could style differently.
const fixture = (size, backdrop, mode) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: ${backdrop}; }
  .jpdb-subtitle-player { --subtitle-font-size-target: ${size}px; }
  .jpdb-subtitle-text { left: 40px; right: auto; bottom: auto; top: 200px; text-align: left; }
  .probe { display: inline-block; width: 0; height: 0; vertical-align: baseline; }
  ${mode === 'control' ? '.jpdb-subtitle-primary .jpdb-reader-furi { visibility: hidden !important; }' : ''}
  ${mode === 'ink' ? '.jpdb-subtitle-text, .jpdb-subtitle-primary .jpdb-reader-word, .jpdb-subtitle-primary .jpdb-reader-furi { text-shadow: none !important; -webkit-text-stroke: 0 !important; }' : ''}
</style></head>
<body>
  <div class="jpdb-subtitle-player"><div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines">
    <div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary"><span
      class="jpdb-reader-word jpdb-reader-has-furi" id="word" data-expression="続ける"
      ><ruby><span class="jpdb-reader-ruby-base" id="annotated">続</span><rp>(</rp><rt
      class="jpdb-reader-furi" id="reading">つづ</rt><rp>)</rp></ruby>ける<span class="probe" id="probe"></span></span></div></div>
  </div></div></div>
</body></html>`;

// Runs in the page: decode the screenshot with the engine's own PNG decoder and
// hand back a luminance plane. Keeps the transfer to one array per shot.
async function toPixels([dataUrl]) {
    const img = new Image();
    img.src = dataUrl;
    img.decoding = 'sync';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(img, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const out = new Array(width * height);
    for (let i = 0; i < out.length; i += 1) {
        out[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    }
    return { width, height, out };
}

async function shoot(page, size, backdrop, mode, clip) {
    await page.setContent(fixture(size, backdrop, mode), { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
        const rect = box => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height });
        const byId = id => rect(document.getElementById(id).getBoundingClientRect());
        const word = document.getElementById('word');
        const okuriNode = Array.from(word.childNodes).find(node => node.nodeType === 3 && node.textContent.trim());
        const range = document.createRange();
        range.selectNodeContents(okuriNode);
        return {
            annotated: byId('annotated'),
            reading: byId('reading'),
            okurigana: rect(range.getBoundingClientRect()),
            baseline: byId('probe').top,
            fontSize: parseFloat(getComputedStyle(document.querySelector('.jpdb-subtitle-primary')).fontSize),
            readingFontSize: parseFloat(getComputedStyle(document.getElementById('reading')).fontSize),
        };
    });
    const box = clip ?? {
        x: Math.floor(geometry.annotated.left) - 24,
        y: Math.floor(geometry.reading.top) - 24,
        width: Math.ceil(geometry.okurigana.right - geometry.annotated.left) + 48,
        height: Math.ceil(geometry.baseline + geometry.fontSize * 0.45 - geometry.reading.top) + 48,
    };
    const shot = await page.screenshot({ clip: box });
    const pixels = await page.evaluate(toPixels, [`data:image/png;base64,${shot.toString('base64')}`]);
    return { geometry, box, pixels };
}

const median = values => values[Math.floor(values.length / 2)];
const toLinear = value => { const channel = value / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
const contrastRatio = (first, second) => {
    const [lighter, darker] = [toLinear(first), toLinear(second)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
};
const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function fail(context, message, detail) {
    throw new Error(`${context}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

async function measure(page, size, context) {
    const painted = await shoot(page, size, VIDEO_BACKDROP, 'paint');
    // Layout-identical control: the reading still occupies its annotation box,
    // it just paints nothing. Everything geometric therefore cancels in the
    // subtraction instead of being modelled.
    const control = await shoot(page, size, VIDEO_BACKDROP, 'control', painted.box);
    // Black backdrop with every outline off: only real glyph pixels are bright,
    // which is what defines where the reading ends and each base glyph begins.
    const inked = await shoot(page, size, '#000000', 'ink', painted.box);
    // `reading` is in this list on purpose: a control that removed the reading
    // from layout instead of merely un-painting it (display:none, or a future
    // stylesheet that collapses an empty rt) leaves the base glyphs in place in
    // Blink, so the box check would pass while every wash and reach number
    // silently collapsed to zero. The reading's own box is the one that moves.
    for (const part of ['annotated', 'okurigana', 'reading']) {
        for (const edge of ['left', 'right', 'top', 'bottom']) {
            if (Math.abs(painted.geometry[part][edge] - control.geometry[part][edge]) > 0.01) {
                fail(context, `hiding the reading moved the ${part} box's ${edge} edge, so the control is not layout-identical and the wash subtraction would be measuring layout, not ink`, { painted: painted.geometry[part], control: control.geometry[part] });
            }
        }
    }

    const { width, height } = inked.pixels;
    const readingEm = painted.geometry.readingFontSize;
    const column = rect => [
        Math.max(0, Math.round(rect.left) - painted.box.x),
        Math.min(width, Math.round(rect.right) - painted.box.x),
    ];
    const [kanjiLeft, kanjiRight] = column(painted.geometry.annotated);
    const [okuriLeft, okuriRight] = column(painted.geometry.okurigana);
    const rowHasInk = (y, from, to) => {
        for (let x = from; x < to; x += 1) if (inked.pixels.out[y * width + x] > 60) return true;
        return false;
    };
    const readingBoxBottom = Math.round(painted.geometry.reading.bottom) - painted.box.y;
    let readingInkBottom = -1;
    for (let y = 0; y <= readingBoxBottom; y += 1) if (rowHasInk(y, 0, width)) readingInkBottom = y;
    let kanjiInkTop = -1;
    let kanjiInkBottom = -1;
    let okuriInkTop = -1;
    for (let y = readingInkBottom + 1; y < height; y += 1) {
        if (rowHasInk(y, kanjiLeft, kanjiRight)) {
            if (kanjiInkTop < 0) kanjiInkTop = y;
            kanjiInkBottom = y;
        }
        if (okuriInkTop < 0 && rowHasInk(y, okuriLeft, okuriRight)) okuriInkTop = y;
    }
    if (readingInkBottom < 0 || kanjiInkTop < 0 || okuriInkTop < 0) {
        fail(context, 'could not locate the reading, the kanji and the okurigana as three separate runs of ink; the fixture stopped rendering 続ける as an annotated word', { readingInkBottom, kanjiInkTop, okuriInkTop });
    }

    // The clear band: below the reading's ink, above the FIRST ink of either
    // base glyph. Bounding it by both is what makes the two columns comparable —
    // neither sample contains a glyph pixel, so any difference between them is
    // the outline and only the outline.
    const bandTop = readingInkBottom + 1;
    const bandBottom = Math.min(kanjiInkTop, okuriInkTop) - 1;
    if (bandBottom - bandTop < 1) fail(context, 'the reading and the base glyphs have no clear space between them at all, so the wash comparison has nowhere to sample', { bandTop, bandBottom });
    const columnMean = (pixels, from, to, firstRow, lastRow) => {
        let sum = 0;
        let count = 0;
        for (let y = firstRow; y <= lastRow; y += 1) {
            for (let x = from; x < to; x += 1) { sum += pixels.out[y * width + x]; count += 1; }
        }
        return sum / count;
    };
    // Lower half of that band: the rows against the kanji, which is where a halo
    // that makes the kanji "look dirty" actually lands. Sampling the whole band
    // instead would average in the rows that hug the reading's own underside,
    // where dark ink is the outline doing its job.
    const lowerTop = bandTop + Math.floor((bandBottom - bandTop + 1) / 2);
    const wash = (from, to) => columnMean(control.pixels, from, to, lowerTop, bandBottom) - columnMean(painted.pixels, from, to, lowerTop, bandBottom);
    const kanjiWash = wash(kanjiLeft, kanjiRight);
    const okuriWash = wash(okuriLeft, okuriRight);

    // Reach: the deepest row under the reading where the kanji's column is
    // measurably darker than the control, i.e. how far the outline actually
    // carries down toward the glyph it annotates.
    let reachRows = 0;
    for (let y = bandTop; y <= kanjiInkBottom; y += 1) {
        let painting = 0;
        let clean = 0;
        for (let x = kanjiLeft; x < kanjiRight; x += 1) {
            painting += painted.pixels.out[y * width + x];
            clean += control.pixels.out[y * width + x];
        }
        if ((clean - painting) / (kanjiRight - kanjiLeft) > 0.5) reachRows = y - readingInkBottom;
    }

    // Legibility over a bright frame, PER DIRECTION. From every boundary pixel
    // of the reading, walk outward in each direction that leaves the ink and
    // keep the darkest luminance met. Starting at the FIRST pixel outside the
    // ink is what keeps a tight outline visible to the metric instead of only
    // rewarding wide halos; taking a minimum along the ray is what stops the
    // glyph's own antialiasing from washing the number out. Each direction is
    // reduced and asserted on its own — combining them is what hid the interim
    // fix's downward regression behind its upward gain.
    const bright = await shoot(page, size, BRIGHT_BACKDROP, 'paint', painted.box);
    const top = Math.max(1, Math.floor(bright.geometry.reading.top) - bright.box.y - 8);
    const bottom = Math.min(height - 1, Math.ceil(bright.geometry.reading.bottom) - bright.box.y + 8);
    const left = Math.max(1, Math.floor(bright.geometry.reading.left) - bright.box.x - 8);
    const right = Math.min(width - 1, Math.ceil(bright.geometry.reading.right) - bright.box.x + 8);
    const isInk = (x, y) => inked.pixels.out[y * width + x] > 140 && y <= readingInkBottom;
    const probeReach = Math.max(2, Math.round(readingEm * 0.28));
    const rays = { up: [], down: [], left: [], right: [] };
    const body = [];
    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
            if (!isInk(x, y)) continue;
            body.push(bright.pixels.out[y * width + x]);
            for (const [name, [dx, dy]] of Object.entries(DIRECTIONS)) {
                if (isInk(x + dx, y + dy)) continue;
                let darkest = Infinity;
                for (let step = 1; step <= probeReach; step += 1) {
                    const nx = x + dx * step;
                    const ny = y + dy * step;
                    if (nx < left || nx >= right || ny < top || ny >= bottom) break;
                    if (isInk(nx, ny)) break;
                    darkest = Math.min(darkest, bright.pixels.out[ny * width + nx]);
                }
                if (Number.isFinite(darkest)) rays[name].push(darkest);
            }
        }
    }
    if (!body.length) fail(context, 'the reading painted no measurable glyph; the fixture stopped rendering the annotation', {});
    body.sort((a, b) => a - b);
    const bodyLevel = median(body);
    const legibility = {};
    for (const name of Object.keys(DIRECTIONS)) {
        if (!rays[name].length) fail(context, `the reading has no measurable ${name} edge, so that direction cannot be asserted`, {});
        rays[name].sort((a, b) => a - b);
        legibility[name] = contrastRatio(bodyLevel, median(rays[name]));
    }

    return {
        size,
        readingEm,
        gapEm: (bandBottom - bandTop + 1) / readingEm,
        reachEm: reachRows / readingEm,
        kanjiWash,
        okuriWash,
        washDifferential: kanjiWash - okuriWash,
        legibility,
    };
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    const readings = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
        for (const size of SIZES) {
            const context = `${name} ${size}px cue`;
            const result = await measure(page, size, context);
            readings.push(result);

            const spend = result.reachEm / result.gapEm;
            if (spend > MAX_REACH_OVER_GAP) {
                fail(context, `the reading's outline reaches ${result.reachEm.toFixed(3)}em down toward the kanji, ${spend.toFixed(2)}x the ${result.gapEm.toFixed(3)}em of clear space it has (cap ${MAX_REACH_OVER_GAP}x) — the outline is wider than the room it has, so it paints on the kanji`, { ...result, reachOverGap: spend });
            }
            if (result.washDifferential > MAX_WASH_DIFFERENTIAL) {
                fail(context, `in the clear space against the two glyphs, the annotated kanji's column is ${result.washDifferential.toFixed(2)} luminance darker than the plain okurigana's column beside it (cap ${MAX_WASH_DIFFERENTIAL}); that difference within one word IS the reported bug`, result);
            }
            const floors = LEGIBILITY_FLOOR[name][size];
            for (const [direction, floor] of Object.entries(floors)) {
                if (result.legibility[direction] < floor) {
                    fail(context, `the reading's ${direction}-side glyph-vs-outline contrast over a bright frame is ${result.legibility[direction].toFixed(2)}, under the ${floor} the owner-tuned build achieved. The cure for the wash must never be a weaker outline, and it must not be a weaker outline on ONE side either — pushing the mass to the opposite edge is not a fix, it is a trade`, { ...result, direction, floor });
                }
            }
        }

        for (const entry of readings) {
            const { legibility: legible } = entry;
            console.log(`${name} ${String(entry.size).padStart(2)}px: reach ${entry.reachEm.toFixed(3)}em = ${(entry.reachEm / entry.gapEm).toFixed(2)}x the ${entry.gapEm.toFixed(3)}em gap, kanji-vs-okurigana wash ${entry.washDifferential.toFixed(2)}, legibility up ${legible.up.toFixed(2)} down ${legible.down.toFixed(2)} left ${legible.left.toFixed(2)} right ${legible.right.toFixed(2)}`);
        }
    } finally {
        await browser.close();
    }
}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('subtitle furigana outline scale smoke passed');
