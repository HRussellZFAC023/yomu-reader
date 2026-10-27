import * as files from 'node:fs';
import * as paths from 'node:path';
import * as urls from 'node:url';
import * as browsers from 'playwright';
import * as colorSources from '../../src/reader/theme/color-source-classes.ts';
import * as assertions from 'node:assert/strict';
import * as bundler from 'esbuild';
import * as smokeHelpers from './smoke-test-helpers.mjs';

// Former subtitle-furigana-outline-scale-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertSubtitleFuriganaOutlineScale(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { readFileSync } = files;
    const { default: path } = paths;
    const { fileURLToPath } = urls;
    const { chromium, webkit } = browsers;
// Real-engine regression: the legibility outline on a subtitle reading must be
// SIZE-INVARIANT in shape, it must stay off the kanji it annotates, AND it must
// keep the reading legible over bright footage IN EVERY DIRECTION.
//
// The reported bug was "kanji that carry furigana render darker than the
// okurigana beside them". It is not the highlight family — it reproduces with
// every highlight channel off. The cause is geometric:
//
//   * The OUTLINE used fixed pixel radii (0 1px 1px / 0 0 3px / 0 0 7px), so its
//     reach measured as a fraction of the reading grew as the cue shrank:
//     0.144em at 60px but 0.431em at 20px in Blink (0.517em in WebKit).
//   * The clear space between the reading's ink and the base glyph's ink does
//     NOT grow to match — see the note on MAX_REACH_SPEND below. So on small
//     cues the halo crossed out of that space and onto the top of the kanji's
//     band. Okurigana carries no reading, so nothing washes it — hence the
//     visible difference WITHIN one word.
//
// SEVERAL words are measured, not one. The clear space is a property of the
// word, not just of the cue size (again, see MAX_REACH_SPEND), so a threshold
// calibrated on a single fixture is a threshold calibrated on that fixture's
// glyphs. An earlier version of this file measured only 続ける and passed a flat
// 0.6x-of-the-gap cap; the same shipped stylesheet measured 0.67x on 志す, whose
// four-kana reading over one kanji leaves visibly less room. That was a
// threshold artefact, not a regression — but a smoke that only holds for one
// word is not a regression test, it is a fixture.
//
// Every word is an annotated kanji plus plain okurigana in ONE word, which is
// the comparison the bug report actually makes. An earlier version rendered a
// bare annotated 続 with no okurigana, so it could assert things about the kanji
// but never measure the difference the user sees.
//
// Three things are asserted, because fixing any one alone is a regression:
//
//   (i)   REACH — THE LOAD-BEARING ASSERTION. The outline's downward reach must
//         stay inside the clear space that word actually has, at every cue size,
//         in both engines. A fixed-pixel declaration cannot satisfy this: its
//         reach in pixels is the same on every cue while the gap shrinks with
//         the cue, so the ratio climbs until the halo crosses onto the kanji
//         (measured up to 2.00x the whole gap in Blink, 1.50x in WebKit).
//   (ii)  WASH — the same physics restated as the quantity the bug report names:
//         in the clear space adjacent to the kanji AND over the top of the
//         kanji's own band, the annotated kanji's column must not be measurably
//         darker than the okurigana's column beside it. Be honest about what
//         this adds: a halo can only darken the kanji by reaching it, so (ii)
//         essentially cannot fail while (i) passes. It is kept because it is the
//         user-visible number and because it is measured in the columns and rows
//         the reader actually looks at, but REACH is the assertion doing the
//         work, and a change that weakens (i) is not excused by a clean (ii).
//   (iii) LEGIBILITY — the reading's contrast over a BRIGHT, video-like backdrop
//         must not drop below the owner-tuned pixel outline rendered by the SAME
//         engine and font, asserted PER DIRECTION. A median or mean over
//         directions is what let an interim fix ship: it moved the outline's
//         mass upward, so up rose while down fell, and the middle of those two
//         barely moved. The reading sits above the caption line with open video
//         under it; the underside is exactly the edge that needs the outline
//         most.
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

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

// Check the stylesheet shipped with the same build as the host.
const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');

// The product default is --subtitle-font-size-target: 28px; the user's size
// control moves it either way, so the whole working range is checked.
const SIZES = [20, 28, 40, 60];

// One annotated kanji plus plain okurigana each, spanning the range of reading
// widths a reader actually meets: one kana over the kanji (見る) up to five
// (承る). The wide ones are not decoration — 志す is the word on which the old
// single-fixture threshold turned out to be wrong, and both wide words are the
// case where Blink stretches the ruby base past the ruby box (see the partition
// note in measure()).
//
// `legibility` marks the word whose per-direction contrast is compared with an
// in-run owner-tuned reference. The other words are geometry-only because one
// representative reading is enough for the paint comparison while every word
// remains necessary for the variable ruby geometry.
const WORDS = [
    { base: '続', reading: 'つづ', okurigana: 'ける', legibility: true },
    { base: '志', reading: 'こころざ', okurigana: 'す' },
    { base: '承', reading: 'うけたまわ', okurigana: 'る' },
    { base: '見', reading: 'み', okurigana: 'る' },
].map(word => ({
    ...word,
    label: `${word.base}${word.okurigana}`,
    // yomuRubyHtml's classes (dom/yomu-ruby.ts, dom/ruby-overhang.ts): a reading
    // more than twice as long as its base may overhang, and every word here
    // starts with its annotated kanji.
    rubyClass: Array.from(word.reading).length > 2 * Array.from(word.base).length
        ? 'jpdb-reader-ruby jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start'
        : 'jpdb-reader-ruby',
}));

// How much of the clear space between the reading's ink and the base glyph's ink
// the outline may spend, as a fraction of the space THAT word, size and engine
// actually measured. It has to be per-measurement, because the space is neither
// size-invariant nor word-invariant. Measured on the 2.1.6 stylesheet, which
// used native ruby layout (2.2.0's lifted grid reading measures 0.43-0.55em in
// both engines):
//
//   * per word, same 28px cue, Blink: 続ける 0.246em, 承る 0.246em, 見る 0.246em,
//     志す 0.185em. A wide reading sits lower over its kanji.
//   * per size, same word (続ける), Blink: 0.345 / 0.246 / 0.259 / 0.259em at
//     20 / 28 / 40 / 60px.
//   * per engine: 0.185-0.345em Blink, 0.345-0.489em WebKit.
//
// An earlier version of this file asserted a flat 0.6x against a "size-invariant
// ~0.25em" gap. Neither half of that was true, and the flat cap failed the
// shipped stylesheet on 志す for a reason that is pure arithmetic, not physics:
// the clear band is only THREE DEVICE PIXELS tall there, so 0.6 x 3 rows = 1.8
// rows, and a two-row reach that still leaves a clear row of daylight before the
// kanji "exceeds" it by rounding alone.
//
// So the cap is computed in whole device pixel rows, and it is the tighter of:
//   * one clear row of daylight — the halo's deepest darkened row must stay at
//     least one row above the kanji's first ink. This is the physical statement,
//     and it is what a fixed-pixel radius cannot pass.
//   * MAX_REACH_SPEND of the measured band, rounded up to a whole row. This is
//     what keeps a big-gap cell honest (WebKit at 60px measures 17 rows), where
//     "one row of daylight" alone would allow a halo twice the shipped depth.
const MAX_REACH_SPEND = 0.6;
const maxReachRows = gapRows => gapRows > 0
    ? Math.min(gapRows - 1, Math.max(1, Math.ceil(gapRows * MAX_REACH_SPEND)))
    : null;

// How much darker (0-255 luminance) the annotated kanji's columns may be than
// the plain okurigana's columns, over the clear space against the two glyphs and
// the top of the base glyphs' own band. This IS the reported bug, stated as a
// number. The pre-fix build measured up to 3.10 here; the shipped build measures
// at most 0.20 across every word, size and engine.
// Calibrated against the strong (gap-strip) metric, measured on this fixture
// set: the pre-fix fixed-pixel radii score 4.37-5.52 and the shipped em-relative
// outline scores at most 1.08. A cap of 2 rejects the former and accepts the
// latter with room, and would catch any regression at even half the old size.
// It is NOT 0.5 — that number belongs to the diluted mean this metric replaced.
const MAX_WASH_DIFFERENTIAL = 2;

// Compare against the original owner-tuned outline in the same browser process
// instead of hard-coding measurements from one operating system's Japanese
// font. Glyph rasterisation differs materially between macOS and Linux; the
// declaration being protected does not. This keeps the quality bar strict and
// portable: the shipped outline must equal or beat the reference on every edge.
const OWNER_TUNED_REFERENCE_SHADOW = `
    0 1px 1px var(--subtitle-outline, var(--jpdb-reader-video-outline)),
    0 0 3px var(--subtitle-outline, var(--jpdb-reader-video-outline)),
    0 0 7px var(--jpdb-reader-video-shadow-heavy)
`;
const LEGIBILITY_TOLERANCE = 0.02;

const BRIGHT_BACKDROP = '#ebebeb';
const VIDEO_BACKDROP = '#808080';

// Exactly what renderRuby emits: an annotated kanji run followed by a bare
// okurigana text node, inside one subtitle word, inside the on-video cue's real
// container chain. The okurigana is deliberately NOT wrapped in a span — its
// column is located with a Range, so the control column is untouched product
// markup rather than a probe the stylesheet could style differently.
//
// The ruby carries its real class. The generic `:where(.jpdb-reader-ruby) > rt`
// rule sets the reading's line-height, and that decides how far the reading
// sits above the kanji. A bare <ruby> measured more clearance than the product
// has.
//
// `jpdb-subtitle-has-primary` is the state class reconcileSubtitlePrimaryRow
// (src/reader/subtitles/subtitle-rendering.ts) puts on the lines host whenever a
// cue is showing; without it the stylesheet hides the whole primary row.
//
// The cue backdrop is turned off. The product default is a 75% black panel
// behind the Japanese line, but the learner can set its opacity to 0, and then
// the outline is all that stands between the reading and the footage. That is
// the case this smoke protects. Over the default panel every sample would sit
// on near-black, which would weaken the reach, wash and legibility signals
// without anything failing.
const HIDE_READING = '.jpdb-subtitle-primary .jpdb-reader-furi { visibility: hidden !important; }';
const NO_OUTLINE = '.jpdb-subtitle-text, .jpdb-subtitle-primary .jpdb-reader-word, .jpdb-subtitle-primary .jpdb-reader-furi { text-shadow: none !important; -webkit-text-stroke: 0 !important; }';
const fixture = (word, size, backdrop, mode) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: ${backdrop}; }
  .jpdb-subtitle-player { --subtitle-font-size-target: ${size}px; --subtitle-background-rgba: transparent; }
  .jpdb-subtitle-text { left: 40px; right: auto; bottom: auto; top: 200px; text-align: left; }
  .probe { display: inline-block; width: 0; height: 0; vertical-align: baseline; }
  ${mode === 'control' || mode === 'base-ink' ? HIDE_READING : ''}
  ${mode === 'ink' || mode === 'base-ink' ? NO_OUTLINE : ''}
  ${mode === 'reference' ? `.jpdb-subtitle-primary .jpdb-reader-furi { text-shadow: ${OWNER_TUNED_REFERENCE_SHADOW} !important; }` : ''}
</style></head>
<body>
  <div class="jpdb-subtitle-player"><div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines jpdb-subtitle-has-primary">
    <div class="jpdb-subtitle-primary-row"><div class="jpdb-subtitle-primary"><span
      class="jpdb-reader-word jpdb-reader-has-furi" id="word" data-expression="${word.label}"
      ><ruby class="${word.rubyClass}"><span class="jpdb-reader-ruby-base" id="annotated">${word.base}</span><rp>(</rp><rt
      class="jpdb-reader-furi" id="reading">${word.reading}</rt><rp>)</rp></ruby>${word.okurigana}<span class="probe" id="probe"></span></span></div></div>
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

let outlinePageReady = false;
async function shoot(page, word, size, backdrop, mode, clip) {
    if (!outlinePageReady) {
        await page.setContent(fixture(word, size, backdrop, 'paint'), { waitUntil: 'domcontentloaded' });
        outlinePageReady = true;
    }
    await page.evaluate(({ word, size, backdrop, controls }) => {
        document.documentElement.style.background = backdrop;
        document.body.style.background = backdrop;
        document.querySelector('.jpdb-subtitle-player').style.setProperty('--subtitle-font-size-target', `${size}px`);
        const host = document.getElementById('word');
        host.dataset.expression = word.label;
        host.innerHTML = `<ruby class="${word.rubyClass}"><span class="jpdb-reader-ruby-base" id="annotated">${word.base}</span><rp>(</rp><rt class="jpdb-reader-furi" id="reading">${word.reading}</rt><rp>)</rp></ruby>${word.okurigana}<span class="probe" id="probe"></span>`;
        let style = document.getElementById('outline-variant');
        if (!style) { style = document.createElement('style'); style.id = 'outline-variant'; document.head.append(style); }
        style.textContent = controls;
    }, { word, size, backdrop, controls: [
        mode === 'control' || mode === 'base-ink' ? HIDE_READING : '',
        mode === 'ink' || mode === 'base-ink' ? NO_OUTLINE : '',
        mode === 'reference' ? `.jpdb-subtitle-primary .jpdb-reader-furi { text-shadow: ${OWNER_TUNED_REFERENCE_SHADOW} !important; }` : '',
    ].join('\n') });
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

function assertLayoutIdentical(context, painted, hidden) {
    for (const part of ['annotated', 'okurigana', 'reading']) {
        for (const edge of ['left', 'right', 'top', 'bottom']) {
            if (Math.abs(painted.geometry[part][edge] - hidden.geometry[part][edge]) > 0.01) {
                fail(context, `hiding the reading moved the ${part} box's ${edge} edge, so the control is not layout-identical and the wash subtraction would be measuring layout, not ink`, { painted: painted.geometry[part], control: hidden.geometry[part] });
            }
        }
    }
}

async function measure(page, word, size, context) {
    const painted = await shoot(page, word, size, VIDEO_BACKDROP, 'paint');
    // A zero box means the stylesheet hid the cue, not that the reading lost its
    // colour. Name that here so the ink check below is not misread.
    for (const part of ['annotated', 'reading']) {
        if (!painted.geometry[part].width || !painted.geometry[part].height) {
            fail(context, `the ${part} box is empty, so the stylesheet is not displaying the cue; the fixture markup has drifted from what subtitle-rendering.ts emits`, painted.geometry[part]);
        }
    }
    // Layout-identical control: the reading still occupies its annotation box,
    // it just paints nothing. Everything geometric therefore cancels in the
    // subtraction instead of being modelled.
    const control = await shoot(page, word, size, VIDEO_BACKDROP, 'control', painted.box);
    // Black backdrop with every outline off: only real glyph pixels are bright,
    // which is what defines where the reading ends and each base glyph begins.
    // The second shot also hides the reading. The subtitle reading's box ends
    // exactly where the base box starts, so the pixel row on that boundary can
    // hold base ink; "bright with the reading, dark without it" is the only
    // exact way to tell the reading's ink from the kanji's.
    const inked = await shoot(page, word, size, '#000000', 'ink', painted.box);
    const baseInked = await shoot(page, word, size, '#000000', 'base-ink', painted.box);
    // `reading` is in this list on purpose: a control that removed the reading
    // from layout instead of merely un-painting it (display:none, or a future
    // stylesheet that collapses an empty rt) leaves the base glyphs in place in
    // Blink, so the box check would pass while every wash and reach number
    // silently collapsed to zero. The reading's own box is the one that moves.
    for (const hidden of [control, baseInked]) assertLayoutIdentical(context, painted, hidden);

    const { width, height } = inked.pixels;
    const readingEm = painted.geometry.readingFontSize;
    const column = rect => [
        Math.max(0, Math.round(rect.left) - painted.box.x),
        Math.min(width, Math.round(rect.right) - painted.box.x),
    ];
    const [kanjiBoxLeft, kanjiBoxRight] = column(painted.geometry.annotated);
    const [okuriBoxLeft, okuriBoxRight] = column(painted.geometry.okurigana);
    const isBaseInk = (x, y) => baseInked.pixels.out[y * width + x] > 60;
    const isReadingInk = (x, y, threshold = 60) => inked.pixels.out[y * width + x] > threshold && !isBaseInk(x, y);
    const rowHas = (isInk, y, from, to) => {
        for (let x = from; x < to; x += 1) if (isInk(x, y)) return true;
        return false;
    };
    const readingBoxBottom = Math.round(painted.geometry.reading.bottom) - painted.box.y;
    let readingInkBottom = -1;
    for (let y = 0; y <= readingBoxBottom; y += 1) if (rowHas(isReadingInk, y, 0, width)) readingInkBottom = y;
    if (readingInkBottom < 0) fail(context, 'the reading painted no ink at all, so the fixture stopped rendering the annotation', {});

    // Partition the base line into two columns that share no pixel. Two engine
    // facts make the raw layout boxes unusable for this:
    //   * Blink stretches the ruby BASE box out to the annotation's width and
    //     lets it overflow the ruby box itself. On 志す at 28px the base span
    //     reports 60px wide while the ruby reserves 52px, so the base box
    //     overlaps the okurigana's box by 8px: the "annotated" and "plain"
    //     samples would literally share the す pixels, and the kanji's ink
    //     extent would come out 43px wide instead of the glyph's 25px.
    //   * WebKit does not stretch it, so the same fixture partitions cleanly
    //     there — which is why a narrow-reading fixture never showed this.
    // Clipping each box against the other and THEN narrowing to the columns that
    // actually hold ink makes the comparison the same shape in both engines and
    // at every reading width.
    const inkColumns = (from, to) => {
        let first = -1;
        let last = -1;
        for (let x = from; x < to; x += 1) {
            let hasInk = false;
            for (let y = 0; y < height; y += 1) {
                if (isBaseInk(x, y)) { hasInk = true; break; }
            }
            if (hasInk) {
                if (first < 0) first = x;
                last = x;
            }
        }
        return [first, last + 1];
    };
    const [kanjiLeft, kanjiRight] = inkColumns(kanjiBoxLeft, Math.min(kanjiBoxRight, okuriBoxLeft));
    const [okuriLeft, okuriRight] = inkColumns(Math.max(okuriBoxLeft, kanjiBoxRight), okuriBoxRight);
    if (kanjiLeft < 0 || okuriLeft < 0 || kanjiRight > okuriLeft) {
        fail(context, 'could not partition the base line into a kanji column and a plain okurigana column that share no pixel, so the wash comparison would be comparing a column against itself', { kanjiBoxLeft, kanjiBoxRight, okuriBoxLeft, okuriBoxRight, kanjiLeft, kanjiRight, okuriLeft, okuriRight });
    }

    let kanjiInkTop = -1;
    let kanjiInkBottom = -1;
    let okuriInkTop = -1;
    let okuriInkBottom = -1;
    for (let y = 0; y < height; y += 1) {
        if (rowHas(isBaseInk, y, kanjiLeft, kanjiRight)) {
            if (kanjiInkTop < 0) kanjiInkTop = y;
            kanjiInkBottom = y;
        }
        if (rowHas(isBaseInk, y, okuriLeft, okuriRight)) {
            if (okuriInkTop < 0) okuriInkTop = y;
            okuriInkBottom = y;
        }
    }
    if (kanjiInkTop < 0 || okuriInkTop < 0) {
        fail(context, `could not locate the reading, the kanji and the okurigana as three separate runs of ink; the fixture stopped rendering ${word.label} as an annotated word`, { readingInkBottom, kanjiInkTop, okuriInkTop });
    }

    // The clear band: below the reading's ink, above the FIRST ink of either
    // base glyph. Bounding it by both is what makes the two columns comparable —
    // neither sample contains a glyph pixel, so any difference between them is
    // the outline and only the outline.
    const bandTop = readingInkBottom + 1;
    const bandBottom = Math.min(kanjiInkTop, okuriInkTop) - 1;
    const gapRows = Math.max(0, bandBottom - bandTop + 1);
    const columnMean = (pixels, from, to, firstRow, lastRow) => {
        let sum = 0;
        let count = 0;
        for (let y = firstRow; y <= lastRow; y += 1) {
            for (let x = from; x < to; x += 1) { sum += pixels.out[y * width + x]; count += 1; }
        }
        return sum / count;
    };
    // From the middle of the clear band down to the row above the base glyphs'
    // first ink. Starting at the band's midpoint rather than its top skips the
    // rows that hug the reading's underside, where dark ink is the outline doing
    // its job.
    //
    // The band deliberately stops SHORT of the glyphs' own rows. Extending over
    // them is sound in principle — the base ink cancels in the subtraction, since
    // painted and control differ only in the reading — but this is a MEAN, and
    // those rows are mostly ones the halo never reaches. Measured: extending the
    // band a third of the way into the glyphs moved the pre-fix wash from
    // 4.37/5.52 to 1.21/1.35 at chromium 20/28px, a 76% dilution of the very
    // signal being asserted. A cap applied to a diluted mean is a weaker cap.
    // Linux's default Japanese font can rasterise the reading's last ink row
    // immediately above the base glyphs' first ink row. There is then no blank
    // strip to sample, but the layout-identical subtraction still lets us
    // measure the reported bug directly over the top of both glyphs: their own
    // ink cancels, leaving only any extra darkness cast by the reading outline.
    const hasClearBand = gapRows > 0;
    const glyphSampleTop = Math.max(kanjiInkTop, okuriInkTop);
    const glyphSampleBottom = Math.min(
        kanjiInkBottom,
        okuriInkBottom,
        glyphSampleTop + Math.max(1, Math.round(painted.geometry.fontSize * 0.12)) - 1,
    );
    if (!hasClearBand && glyphSampleBottom < glyphSampleTop) {
        fail(context, 'the reading has no clear row and the base glyphs have no common top band, so the outline wash cannot be compared', {
            bandTop,
            bandBottom,
            kanjiInkTop,
            kanjiInkBottom,
            okuriInkTop,
            okuriInkBottom,
        });
    }
    const lowerTop = hasClearBand
        ? bandTop + Math.floor(gapRows / 2)
        : glyphSampleTop;
    const washBottom = hasClearBand
        ? Math.max(lowerTop, kanjiInkTop - 1)
        : glyphSampleBottom;
    const wash = (from, to) => columnMean(control.pixels, from, to, lowerTop, washBottom) - columnMean(painted.pixels, from, to, lowerTop, washBottom);
    const kanjiWash = wash(kanjiLeft, kanjiRight);
    const okuriWash = wash(okuriLeft, okuriRight);

    // Reach: the deepest row under the reading where the kanji's columns are
    // measurably darker than the control, i.e. how far the outline actually
    // carries down toward the glyph it annotates. Counted in device pixel rows,
    // because that is the resolution the assertion has to live at.
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
    const result = {
        word: word.label,
        size,
        readingEm,
        gapRows,
        reachRows,
        gapEm: gapRows / readingEm,
        reachEm: reachRows / readingEm,
        kanjiWash,
        okuriWash,
        washDifferential: kanjiWash - okuriWash,
        washSample: hasClearBand ? 'clear-gap' : 'glyph-top',
        legibility: null,
        legibilityReference: null,
    };
    if (!word.legibility) return result;

    // Legibility over a bright frame, PER DIRECTION. From every boundary pixel
    // of the reading, walk outward in each direction that leaves the ink and
    // keep the darkest luminance met. Starting at the FIRST pixel outside the
    // ink is what keeps a tight outline visible to the metric instead of only
    // rewarding wide halos; taking a minimum along the ray is what stops the
    // glyph's own antialiasing from washing the number out. Each direction is
    // reduced and asserted on its own — combining them is what hid the interim
    // fix's downward regression behind its upward gain.
    const bright = await shoot(page, word, size, BRIGHT_BACKDROP, 'paint', painted.box);
    const reference = await shoot(page, word, size, BRIGHT_BACKDROP, 'reference', painted.box);
    for (const edge of ['left', 'right', 'top', 'bottom']) {
        if (Math.abs(bright.geometry.reading[edge] - reference.geometry.reading[edge]) > 0.01) {
            fail(context, `the owner-tuned reference moved the reading box's ${edge} edge, so its contrast is not layout-comparable`, {
                shipped: bright.geometry.reading,
                reference: reference.geometry.reading,
            });
        }
    }
    const directionalLegibility = (render, label) => {
        const top = Math.max(1, Math.floor(render.geometry.reading.top) - render.box.y - 8);
        const bottom = Math.min(height - 1, Math.ceil(render.geometry.reading.bottom) - render.box.y + 8);
        const left = Math.max(1, Math.floor(render.geometry.reading.left) - render.box.x - 8);
        const right = Math.min(width - 1, Math.ceil(render.geometry.reading.right) - render.box.x + 8);
        const isInk = (x, y) => y <= readingInkBottom && isReadingInk(x, y, 140);
        const probeReach = Math.max(2, Math.round(readingEm * 0.28));
        const rays = { up: [], down: [], left: [], right: [] };
        const body = [];
        for (let y = top; y < bottom; y += 1) {
            for (let x = left; x < right; x += 1) {
                if (!isInk(x, y)) continue;
                body.push(render.pixels.out[y * width + x]);
                for (const [name, [dx, dy]] of Object.entries(DIRECTIONS)) {
                    if (isInk(x + dx, y + dy)) continue;
                    let darkest = Infinity;
                    for (let step = 1; step <= probeReach; step += 1) {
                        const nx = x + dx * step;
                        const ny = y + dy * step;
                        if (nx < left || nx >= right || ny < top || ny >= bottom) break;
                        if (isInk(nx, ny)) break;
                        darkest = Math.min(darkest, render.pixels.out[ny * width + nx]);
                    }
                    if (Number.isFinite(darkest)) rays[name].push(darkest);
                }
            }
        }
        if (!body.length) fail(context, `${label} painted no measurable reading glyph`, {});
        body.sort((a, b) => a - b);
        const bodyLevel = median(body);
        const measured = {};
        for (const name of Object.keys(DIRECTIONS)) {
            if (!rays[name].length) fail(context, `${label} has no measurable ${name} edge`, {});
            rays[name].sort((a, b) => a - b);
            measured[name] = contrastRatio(bodyLevel, median(rays[name]));
        }
        return measured;
    };
    return {
        ...result,
        legibility: directionalLegibility(bright, 'the shipped outline'),
        legibilityReference: directionalLegibility(reference, 'the owner-tuned reference'),
    };
}

async function verifyEngine(name, browserType) {
    if (browserType.name() !== _hostEngine) return;
    const browser = _hostBrowser;
    const readings = [];

        const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 1 });
        for (const word of WORDS) {
            for (const size of SIZES) {
                readings.push(await measure(page, word, size, `${name} ${size}px cue on ${word.label}`));
            }
        }


    // Print every cell BEFORE asserting, so a failure hands over the whole
    // measured table rather than only the cell that happened to trip first.
    for (const entry of readings) {
        const legible = entry.legibility
            ? `, legibility up ${entry.legibility.up.toFixed(2)}/${entry.legibilityReference.up.toFixed(2)} down ${entry.legibility.down.toFixed(2)}/${entry.legibilityReference.down.toFixed(2)} left ${entry.legibility.left.toFixed(2)}/${entry.legibilityReference.left.toFixed(2)} right ${entry.legibility.right.toFixed(2)}/${entry.legibilityReference.right.toFixed(2)} (shipped/reference)`
            : '';
        const cap = maxReachRows(entry.gapRows);
        const reachGate = cap === null ? 'direct glyph-top wash gate' : `cap ${cap} rows`;
        console.log(`${name} ${entry.word} ${String(entry.size).padStart(2)}px: reach ${entry.reachRows}/${entry.gapRows} rows (${entry.reachEm.toFixed(3)}em of ${entry.gapEm.toFixed(3)}em, ${reachGate}), kanji-vs-okurigana wash ${entry.washDifferential.toFixed(2)} (${entry.washSample})${legible}`);
    }

    // Asserted in three passes over the whole table rather than cell by cell, so
    // that when a change trips more than one of them the report names REACH —
    // the geometric cause — ahead of the wash and the legibility it drags with
    // it. A naive px->em conversion of the pre-fix radii trips all three; being
    // told about its legibility first would send the next reader after the wrong
    // one.
    const context = entry => `${name} ${entry.size}px cue on ${entry.word}`;
    for (const entry of readings) {
        const cap = maxReachRows(entry.gapRows);
        if (cap !== null && entry.reachRows > cap) {
            fail(context(entry), `the reading's outline reaches ${entry.reachRows} device pixel rows (${entry.reachEm.toFixed(3)}em) down toward the kanji, past the ${cap} rows it may spend of the ${entry.gapRows} rows (${entry.gapEm.toFixed(3)}em) of clear space this word has here — the outline is wider than the room it has, so it paints on the kanji`, { ...entry, cap, spendOfGap: entry.reachRows / entry.gapRows });
        }
    }
    for (const entry of readings) {
        if (entry.washDifferential > MAX_WASH_DIFFERENTIAL) {
            fail(context(entry), `in the clear space against the two glyphs and over the top of their band, the annotated kanji's columns are ${entry.washDifferential.toFixed(2)} luminance darker than the plain okurigana's columns beside them (cap ${MAX_WASH_DIFFERENTIAL}); that difference within one word IS the reported bug`, entry);
        }
    }
    for (const entry of readings) {
        if (!entry.legibility) continue;
        for (const [direction, reference] of Object.entries(entry.legibilityReference)) {
            if (entry.legibility[direction] + LEGIBILITY_TOLERANCE < reference) {
                fail(context(entry), `the reading's ${direction}-side glyph-vs-outline contrast over a bright frame is ${entry.legibility[direction].toFixed(2)}, under the ${reference.toFixed(2)} owner-tuned reference rendered by this same engine and font. The cure for the wash must never be a weaker outline, and it must not be a weaker outline on ONE side either — pushing the mass to the opposite edge is not a fix, it is a trade`, {
                    ...entry,
                    direction,
                    reference,
                    tolerance: LEGIBILITY_TOLERANCE,
                });
            }
        }
    }
}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('subtitle furigana outline scale smoke passed');

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former subtitle-highlight-layers-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertSubtitleHighlightLayers(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { readFileSync } = files;
    const { default: path } = paths;
    const { fileURLToPath } = urls;
    const { chromium, webkit } = browsers;
    const { colorSourceClassName } = colorSources;
// Real-engine regression: a subtitle word must carry exactly ONE painted layer,
// and that layer must sit on the word itself.
//
// A furigana word wraps its kanji run in .jpdb-reader-ruby-base. When both the
// word and that child painted the translucent highlight gradient, the two
// composited over the kanji only, so the kanji rendered visibly darker than the
// okurigana in the same word — reported as "double highlight". The word box and
// the ruby base are vertically coincident, which is exactly what makes a second
// layer double the opacity instead of sitting somewhere harmless, so the word is
// the correct single carrier.
//
// The matrix below is the whole product surface, because a rule family that
// misses one entry reintroduces the bug only there:
//   * markup — the subtitle renderer emits in-flow <ruby>/<rt> (renderRuby) and
//     the detached-reading channel (renderDetachedReadings). An earlier version
//     of this smoke asserted against a bare .jpdb-reader-ruby-base with no
//     <ruby> and no reading at all, a shape nothing in the product renders, so
//     it could not see what either real channel does.
//   * surface — every container class the subtitle channel rules select.
//   * family — highlight AND underline, since the ::after underline lane is a
//     second way for a descendant to paint its own decoration.
// Only a real engine resolves this cascade, and only geometry proves the two
// boxes coincide.

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');

// Every container class the subtitle channel rules select: the on-video cue,
// the transcript drawer rows, the immersion example surface, and the injected
// asbplayer-style container over YouTube.
const SURFACES = [
    'jpdb-subtitle-primary',
    'jpdb-subtitle-row-text',
    'jpdb-reader-subtitle-surface',
    'asbplayer-subtitles-container-bottom',
];

// Each channel mode paints through its own rule set, so all of them are checked.
// The class names come from the module the reader sets them with: the "Anki"
// source's root class is provider-neutral, so a hand-built name drifts.
const MODES = ['highlight', 'underline'].flatMap(family =>
    ['status', 'jpdb', 'anki', 'pitch'].map(source => colorSourceClassName('subtitle', family, source)));

const WORD_CLASSES = 'jpdb-reader-word jpdb-reader-has-furi jpdb-reader-known jpdb-pitch-heiban';
const WORD_ATTRIBUTES = 'data-pitch-class="heiban" data-card-state="known" data-expression="連続" tabindex="-1"';

// Both furigana channels, exactly as renderRuby/renderDetachedReadings emit
// them: a kanji run carrying the reading, then okurigana in the same word.
const CHANNELS = {
    'in-flow ruby': `<span class="${WORD_CLASSES}" ${WORD_ATTRIBUTES}><ruby><span class="jpdb-reader-ruby-base">連続</span><rp>(</rp><rt class="jpdb-reader-furi">れんぞく</rt><rp>)</rp></ruby>する</span>`,
    'detached reading': `<span class="${WORD_CLASSES} jpdb-reader-detached-reading-word" ${WORD_ATTRIBUTES}><span class="jpdb-reader-detached-ruby" data-yomu-source-start="0" data-yomu-source-end="2"><span class="jpdb-reader-ruby-base">連続</span><span class="jpdb-reader-furi jpdb-reader-detached-furi" aria-hidden="true">れんぞく</span></span>する</span>`,
};

const PLAIN_WORD = '<span class="jpdb-reader-word jpdb-reader-known jpdb-pitch-heiban" data-pitch-class="heiban" data-card-state="known" data-expression="今日">今日</span>';

const fixture = (mode, surface, word) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; background: #101010; }
  .jpdb-subtitle-text { position: absolute; top: 90px; left: 30px; font-size: 44px; }
</style></head>
<body class="${mode}">
  <div class="jpdb-subtitle-player">
    <div class="jpdb-subtitle-text">
      <div class="${surface}">${word} ${PLAIN_WORD}</div>
    </div>
  </div>
</body></html>`;

function fail(context, message, detail) {
    throw new Error(`${context}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

// Runs inside the page: report every box in the word's subtree that paints a
// layer of its own, plus the geometry the single-carrier rule depends on.
function inspectWord() {
    const transparent = /^(none|rgba\(0, 0, 0, 0\)|transparent|color\(srgb 0 0 0 \/ 0\))$/;
    const opaque = value => Boolean(value) && !transparent.test(value);
    const rect = element => {
        const box = element.getBoundingClientRect();
        return { top: box.top, height: box.height, left: box.left, width: box.width };
    };
    const layersOf = element => {
        const style = getComputedStyle(element);
        const layers = [];
        if (opaque(style.backgroundImage)) layers.push('background-image');
        if (opaque(style.backgroundColor)) layers.push('background-color');
        if (opaque(style.boxShadow)) layers.push('box-shadow');
        if (style.textDecorationLine !== 'none' && opaque(style.textDecorationColor)) layers.push('text-decoration');
        for (const pseudo of ['::before', '::after']) {
            const generated = getComputedStyle(element, pseudo);
            if (generated.content === 'none') continue;
            if (opaque(generated.backgroundImage)) layers.push(`${pseudo} background-image`);
            if (opaque(generated.backgroundColor)) layers.push(`${pseudo} background-color`);
            const underlined = generated.borderBlockEndStyle !== 'none' && generated.borderBlockEndWidth !== '0px';
            if (underlined && opaque(generated.borderBlockEndColor)) layers.push(`${pseudo} underline`);
        }
        return layers;
    };

    const word = document.querySelector('.jpdb-reader-word.jpdb-reader-has-furi');
    const base = word.querySelector('.jpdb-reader-ruby-base');
    const reading = word.querySelector('.jpdb-reader-furi');
    const plain = document.querySelector('.jpdb-reader-word:not(.jpdb-reader-has-furi)');

    const descendants = [];
    const visit = element => {
        for (const child of element.children) {
            const layers = layersOf(child);
            if (layers.length) {
                const name = String(child.className).trim();
                descendants.push({
                    selector: child.tagName.toLowerCase() + (name ? `.${name.split(/\s+/).join('.')}` : ''),
                    layers,
                    rect: rect(child),
                });
            }
            visit(child);
        }
    };
    visit(word);

    return {
        wordLayers: layersOf(word),
        plainLayers: layersOf(plain),
        descendants,
        wordRect: rect(word),
        baseRect: rect(base),
        readingRect: rect(reading),
    };
}

async function verifyEngine(name, browserType) {
    if (browserType.name() !== _hostEngine) return;
    const browser = _hostBrowser;

        const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
        await page.setContent(fixture(MODES[0], SURFACES[0], CHANNELS['in-flow ruby']));
        for (const [channel, word] of Object.entries(CHANNELS)) {
            for (const surface of SURFACES) {
                for (const mode of MODES) {
                    const context = `${name} ${channel} .${surface} ${mode}`;
                    await page.evaluate(({ mode, surface, word, plain }) => {
                        document.body.className = mode;
                        document.querySelector('.jpdb-subtitle-text').innerHTML = `<div class="${surface}">${word} ${plain}</div>`;
                    }, { mode, surface, word, plain: PLAIN_WORD });
                    const result = await page.evaluate(inspectWord);

                    // The kanji run sits inside the word's painted band, so a
                    // layer on that child composites over the word's own layer
                    // and darkens the kanji alone. This is the premise the
                    // single-carrier rule rests on, so assert it rather than
                    // assume it. (How much taller the word box is varies by
                    // surface: the on-video cue keeps the reading in its own
                    // row above the band, the transcript row does not.)
                    const contained = result.baseRect.top >= result.wordRect.top - 1
                        && result.baseRect.top + result.baseRect.height <= result.wordRect.top + result.wordRect.height + 1;
                    if (!contained) {
                        fail(context, 'the kanji run left the word\'s painted band, so the single-carrier choice needs rechecking', result);
                    }

                    if (result.descendants.length) {
                        fail(context, 'a box inside the word paints its own layer, doubling it over the kanji run', result);
                    }

                    // A word must still be annotated at rest; the cure for the
                    // doubling must never be "stop painting".
                    if (mode.includes('highlight') && (!result.wordLayers.length || !result.plainLayers.length)) {
                        fail(context, 'the subtitle word lost its highlight entirely', result);
                    }
                }
            }
            console.log(`${name} ${channel}: one layer per word across ${SURFACES.length} surfaces × ${MODES.length} modes`);
        }

}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('subtitle highlight layers smoke passed');

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former subtitle-generic-layer-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertSubtitleGenericLayer(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { default: assert } = assertions;
    const { mkdirSync, readFileSync, writeFileSync } = files;
    const { default: path } = paths;
    const { build } = bundler;
    const { chromium, webkit, devices } = browsers;
    const { userscriptCompanionPaths } = smokeHelpers;
// Generic stacking contexts cannot be reached through the YouTube recording's
// site Adapter. This labelled mechanism fixture runs the BUILT video companion
// and shipped CSS; only settings data is exported from source.
const productRoot = path.resolve(process.argv.find(arg => arg.startsWith('--product-root='))?.split('=')[1] ?? '.');
const defaults = await build({
    stdin: { contents: "export { DEFAULT_SETTINGS } from './src/reader/settings';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'CaptionSettingsFixture', logLevel: 'silent',
    define: { 'import.meta.env': '{}', '__YOMU_VERSION__': '"fixture"', '__YOMU_NEWTAB_BUILD__': 'false', '__YOMU_EXTENSION_BUILD__': 'false' },
});
const out = 'artifacts/subtitle-generic-layer';
mkdirSync(out, { recursive: true });
const results = [];
for (const [name, engine] of [[_hostEngine, _hostEngine === 'webkit' ? webkit : chromium]]) {
    const browser = _hostBrowser;

        const page = await browser.newPage({ ...devices['iPad Pro 11'], viewport: { width: 834, height: 1194 } });
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <section style="position:relative;width:700px;height:400px">
            <video style="position:absolute;inset:0;width:100%;height:100%;z-index:1"></video></section>` }));
        await page.goto('https://example.com/generic-caption-layer-mechanism-fixture');
        await page.addStyleTag({ content: readFileSync(path.join(productRoot, 'dist/yomu.css'), 'utf8') });
        for (const file of userscriptCompanionPaths(path.join(productRoot, 'dist/yomu.user.js'))) {
            await page.addScriptTag({ content: readFileSync(file, 'utf8') });
        }
        await page.addScriptTag({ content: defaults.outputFiles[0].text });
        await page.evaluate(() => {
            const settings = { ...window.CaptionSettingsFixture.DEFAULT_SETTINGS, subtitlePlayerEnabled: true,
                subtitleOverlayVisible: true, subtitleControlsMode: 'off', subtitleSecondaryVisible: false };
            const card = { vid:1, sid:1, rid:0, spelling:'日本語', reading:'にほんご',
                meanings:[{glosses:['Japanese'],partOfSpeech:['n']}], frequencyRank:null,
                partOfSpeech:['n'], cardState:['not-in-deck'], pitchAccent:[], wordWithReading:null };
            const controller = new window.__yomuCompanions.video.SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async text => [{card,start:0,end:3,length:3,rubies:[],pitchClass:'unknown',sentence:text}],
                onSettingsChange: () => {},
            });
            controller.install();
            controller.video = document.querySelector('video');
            controller.cues = [{ start: 0, end: 100, text: '日本語です。', transcriptEligible: true }];
            controller.currentCue = controller.cues[0];
            controller.refresh();
            window.captionLayerFixture = controller;
        });
        await page.waitForSelector('.jpdb-subtitle-primary .jpdb-reader-word');
        const tiers = [];
        for (const videoTier of [1, 7, 'auto']) {
            await page.evaluate(tier => {
                document.querySelector('video').style.zIndex = String(tier);
                window.captionLayerFixture.refresh();
            }, videoTier);
            const state = await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').evaluate(element => {
                const range = document.createRange(); range.selectNodeContents(element);
                const rect = range.getBoundingClientRect();
                const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
                const root = element.closest('.jpdb-subtitle-player');
                const captionHit = Boolean(document.elementFromPoint(x, y)?.closest('.jpdb-subtitle-primary'));
                const captionTier = Number(getComputedStyle(root).zIndex);
                const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
                dialog.style.cssText = `position:absolute;inset:0;background:white;z-index:${captionTier + 1}`;
                root.parentElement.append(dialog);
                const dialogHit = document.elementFromPoint(x, y) === dialog;
                dialog.remove();
                return { captionTier, captionHit, dialogHit,
                    restored: Boolean(document.elementFromPoint(x, y)?.closest('.jpdb-subtitle-primary')) };
            });
            assert(state.captionHit && state.restored, `${name}: video tier ${videoTier} covers captions: ${JSON.stringify(state)}`);
            assert(state.dialogHit, `${name}: caption covers a player dialog`);
            assert.equal(state.captionTier, (Number(videoTier) || 0) + 1, `${name}: caption tier does not follow the video`);
            tiers.push({ videoTier, ...state });
        }
        await page.screenshot({ path: `${out}/${name}-mechanism-fixture.png` });
        results.push({ engine: name, tiers });

}
writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
