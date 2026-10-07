#!/usr/bin/env node
// Real-engine regression: a recognized word must be pressable where its glyphs are.
//
// Reported from Yomu Gaming (2026-10-06): "In order to look up a word it finds, I seem to
// have to click or hover where the furigana is, not on the word itself." The overlay's line
// frames grow UPWARD to make room for readings — the reading gutter above the glyphs plus the
// line's own padding and minimum hit size — and each line paints over the line before it. In
// a dialogue box whose lines sit closer than that gutter, the next line's frame covered the
// lower part of every word above it, so a press on the word itself reached the line below and
// only a press up in the reading's strip still found the word.
//
// The fixture is the production shape, not a stand-in:
//   * a "game frame" is a canvas with several lines of dialogue painted at a known size and
//     line pitch, and each line's OCR box is that line's own ink box (ctx.measureText);
//   * the overlay layer is built and fitted by src/gaming/renderer/ocr-lines.ts over the
//     reader's own stylesheet plus the gaming stylesheet;
//   * the words are the reader's markup — a word element with a <ruby> reading or plain
//     text — run through normalizeOcrRenderedText() exactly as the overlay's reader does,
//     then fitted again, as happens when readings arrive after the first paint.
//
// Two measurements per glyph, at several device scale factors, with and without readings:
//   * every point inside each painted glyph box hits the word that owns the glyph;
//   * at the middle of each word, every height across the SOURCE line's ink hits that word,
//     so the press lands on the game's own text, not on the strip above it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// A dialogue box: three lines, each split into the words the reader would wrap. A word with
// a reading carries it as [surface, reading]; bare punctuation stays outside any word.
const DIALOGUE = [
    [['冒険', 'ぼうけん'], ['を'], ['始', 'はじ', 'めよう'], '。'],
    [['夜明', 'よあ', 'け'], ['まで'], ['に'], ['港', 'みなと'], ['へ'], ['行', 'い', 'く'], ['よ'], '。'],
    [['準備', 'じゅんび'], ['は'], ['できた'], ['か'], '？'],
];
const SOURCE_PX = 30;
// Line pitch as a multiple of the type size. 1.25 is a tight but ordinary dialogue box; 1.6
// leaves room for readings and must keep working too.
const LINE_PITCHES = [1.25, 1.6];
const DEVICE_SCALE_FACTORS = [1, 1.25, 1.5, 2];
const GAME_FONT = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
// Sample points inside each painted glyph box, as fractions of it. The edges are left out:
// two glyphs touch there, and which one a boundary pixel belongs to is not the question.
const GLYPH_SAMPLES = [0.2, 0.5, 0.8];
// Heights across the source line's ink box that must reach the word.
const SOURCE_INK_SAMPLES = [0.2, 0.4, 0.6, 0.8];

const { css, bundle } = buildFixtureAssets();
const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; padding: 0; background: #0b0e13; overflow: hidden; }
  #capture { position: fixed; left: 0; top: 0; }
</style></head>
<body class="yomu-gaming-overlay-document"><canvas id="capture"></canvas>
<script>${bundle}</script>
</body></html>`;

const browser = await chromium.launch();
const failures = [];
const rows = [];
try {
    for (const deviceScaleFactor of DEVICE_SCALE_FACTORS) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor });
        const tab = await context.newPage();
        await tab.setContent(page, { waitUntil: 'load' });
        await tab.evaluate(() => document.fonts.ready);
        for (const linePitch of LINE_PITCHES) {
            for (const readings of [false, true]) {
                const measured = await tab.evaluate(measureDialogueHitTargets, {
                    dialogue: DIALOGUE,
                    sourcePx: SOURCE_PX,
                    linePitch,
                    readings,
                    gameFont: GAME_FONT,
                    glyphSamples: GLYPH_SAMPLES,
                    sourceInkSamples: SOURCE_INK_SAMPLES,
                });
                const label = `dpr ${deviceScaleFactor} pitch ${linePitch}em ${readings ? 'with' : 'without'} readings`;
                rows.push({ label, ...measured });
                if (!measured.readingsPainted && readings) failures.push(`${label}: no reading was painted, so the cell proves nothing`);
                for (const miss of measured.glyphMisses.slice(0, 4)) {
                    failures.push(`${label}: line ${miss.line + 1} "${miss.glyph}" at ${miss.at} reached ${miss.hit}`);
                }
                for (const miss of measured.sourceMisses.slice(0, 4)) {
                    failures.push(`${label}: line ${miss.line + 1} word "${miss.word}" ${miss.depth} down the source ink reached ${miss.hit}`);
                }
            }
        }
        await context.close();
    }
} finally {
    await browser.close();
}

for (const row of rows) {
    console.log(`[gaming-hit-target] ${row.label}: ${row.glyphSamples - row.glyphMisses.length}/${row.glyphSamples} glyph points`
        + ` and ${row.sourceSamples - row.sourceMisses.length}/${row.sourceSamples} source-ink points reach their word`);
}
if (failures.length) {
    for (const failure of failures) console.error(`[gaming-hit-target] FAIL ${failure}`);
    process.exit(1);
}
console.log(`[gaming-hit-target] OK — every recognized word is pressable on its own glyphs in ${rows.length} cells.`);

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
            `export { overlayOcrLayerHtml, layoutOverlayOcrLines } from '${source('gaming/renderer/ocr-lines')}';`,
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

// Runs in the page.
function measureDialogueHitTargets({ dialogue, sourcePx, linePitch, readings, gameFont, glyphSamples, sourceInkSamples }) {
    const overlay = window.YomuGamingOverlay;
    const canvas = document.getElementById('capture');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `700 ${sourcePx}px ${gameFont}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5faff';

    const lineText = line => line.map(part => typeof part === 'string' ? part : part[0] + (part[2] ?? '')).join('');
    const firstBaseline = 460;
    const lines = dialogue.map((line, index) => {
        const text = lineText(line);
        const baseline = firstBaseline + index * Math.round(sourcePx * linePitch);
        const left = 140;
        ctx.fillText(text, left, baseline);
        const metrics = ctx.measureText(text);
        return {
            text,
            vertical: false,
            box: {
                left: left - metrics.actualBoundingBoxLeft,
                top: baseline - metrics.actualBoundingBoxAscent,
                width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
                height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
            },
        };
    });

    const frame = { imageLeft: 0, imageTop: 0, imageWidth: canvas.width, imageHeight: canvas.height };
    document.querySelectorAll('.jpdb-ocr-layer').forEach(layer => layer.remove());
    document.body.insertAdjacentHTML('beforeend', overlay.overlayOcrLayerHtml(lines, frame));
    const layer = document.querySelector('.jpdb-ocr-layer');
    overlay.layoutOverlayOcrLines(layer, frame, 1);

    // What the reader leaves on each line once it has been over it: one wrapper, word
    // elements, a <ruby> per reading, bare punctuation. normalizeOcrRenderedText() then
    // turns that into the OCR markup the overlay paints, scanner-isolated as in Gaming.
    const escape = value => value.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`);
    const wordHtml = (part, lineIndex, wordIndex) => {
        const [surface, reading, tail = ''] = part;
        const head = reading && readings
            ? `<ruby><span class="jpdb-reader-ruby-base">${escape(surface)}</span><rt>${escape(reading)}</rt></ruby>`
            : escape(surface);
        const furigana = reading && readings ? ' jpdb-reader-has-furi' : '';
        return `<span class="jpdb-reader-word jpdb-reader-scan-word${furigana}" data-yomu-word="true"`
            + ` data-hit-word="${lineIndex}:${wordIndex}">${head}${escape(tail)}</span>`;
    };
    layer.querySelectorAll('.jpdb-ocr-line').forEach((line, lineIndex) => {
        const text = line.querySelector('.jpdb-ocr-line-text');
        let wordIndex = 0;
        text.innerHTML = `<span>${dialogue[lineIndex].map(part => typeof part === 'string' ? escape(part) : wordHtml(part, lineIndex, wordIndex++)).join('')}</span>`;
        overlay.normalizeOcrRenderedText(text, true);
    });
    overlay.layoutOverlayOcrLines(layer, frame, 1);

    const describe = element => {
        if (!element) return 'nothing';
        const word = element.closest('[data-hit-word]');
        if (word) return `word ${word.dataset.hitWord}`;
        const line = element.closest('.jpdb-ocr-line');
        if (line) return `line ${[...layer.querySelectorAll('.jpdb-ocr-line')].indexOf(line) + 1}`;
        return element.tagName.toLowerCase();
    };
    const glyphMisses = [];
    let glyphSampleCount = 0;
    layer.querySelectorAll('[data-hit-word] .jpdb-ocr-visual-text').forEach(glyphs => {
        if (glyphs.closest('.jpdb-ocr-furi')) return;
        const word = glyphs.closest('[data-hit-word]');
        const rect = glyphs.getBoundingClientRect();
        for (const fx of glyphSamples) {
            for (const fy of glyphSamples) {
                const x = rect.left + rect.width * fx;
                const y = rect.top + rect.height * fy;
                glyphSampleCount += 1;
                const hit = document.elementFromPoint(x, y);
                if (hit?.closest('[data-hit-word]') === word) continue;
                glyphMisses.push({
                    line: Number(word.dataset.hitWord.split(':')[0]),
                    glyph: glyphs.dataset.yomuOcrVisualText,
                    at: `${Math.round(fx * 100)}%,${Math.round(fy * 100)}%`,
                    hit: describe(hit),
                });
            }
        }
    });

    const sourceMisses = [];
    let sourceSampleCount = 0;
    layer.querySelectorAll('[data-hit-word]').forEach(word => {
        const lineIndex = Number(word.dataset.hitWord.split(':')[0]);
        const box = lines[lineIndex].box;
        const rect = word.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        for (const depth of sourceInkSamples) {
            sourceSampleCount += 1;
            const hit = document.elementFromPoint(x, box.top + box.height * depth);
            if (hit?.closest('[data-hit-word]') === word) continue;
            sourceMisses.push({ line: lineIndex, word: word.textContent || [...word.querySelectorAll('.jpdb-ocr-visual-text')].filter(node => !node.closest('.jpdb-ocr-furi')).map(node => node.dataset.yomuOcrVisualText).join(''), depth: `${Math.round(depth * 100)}%`, hit: describe(hit) });
        }
    });

    return {
        readingsPainted: Boolean(layer.querySelector('.jpdb-ocr-furi')),
        glyphSamples: glyphSampleCount,
        glyphMisses,
        sourceSamples: sourceSampleCount,
        sourceMisses,
    };
}
