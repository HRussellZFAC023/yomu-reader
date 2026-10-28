#!/usr/bin/env node
// Cold, source-module fixture: real Chromium/WebKit geometry and the shipped
// annotation stylesheet, without parser/network work or a packaged app. Root
// class/stylesheet changes without a repaint or resize are outside this probe.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { assert, createSmokePaths, launchSmokeBrowser } from './lib/smoke-harness.mjs';

const paths = createSmokePaths(import.meta.dirname);
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
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launchSmokeBrowser(engine, name, { headless: true });
    try {
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
    } finally { await browser.close(); }
}
writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Ruby paragraph-scope smoke passed; source fixture report: ${out}`);
