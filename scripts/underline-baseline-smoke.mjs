#!/usr/bin/env node
// R: "fix the underlines not being at the same level". The colored word
// underline is an ::after pinned to the word's box bottom (inset-block-end).
// Furigana words carry a taller line-height for clearance; if a plain neighbour
// keeps a shorter line-height its box bottom resolves higher and its underline
// floats above. This smoke renders a mixed furigana/plain reading line against
// the built CSS and asserts every word shares one line-height (so every
// underline lands on the same baseline).
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { assert, assertBuiltArtifacts, createSmokePaths, startLoopbackServer } from './lib/smoke-harness.mjs';

const { cssPath: CSS_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([CSS_PATH], ROOT);
const css = readFileSync(CSS_PATH, 'utf8');
const ARTIFACTS = resolve(process.env.YOMU_UNDERLINE_ARTIFACTS ?? join(ROOT, 'qa-artifacts/underline-baseline'));
mkdirSync(ARTIFACTS, { recursive: true });

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin: 0; background: #fff; font: 700 56px/1.3 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif; }
  main { padding: 80px 40px; --jpdb-reader-accent: #d33682; --jpdb-reader-source-pitch-decoration: #d33682; --jpdb-reader-source-pitch-color: #111; }
  .line { white-space: nowrap; }
</style></head>
<body>
  <main class="jpdb-reader-word-underline-pitch jpdb-reader-word-text-pitch">
    <span class="line">
      <span class="jpdb-reader-word jpdb-reader-has-furi" data-pitch-class="heiban"><ruby><span class="jpdb-reader-ruby-base">読</span><rp>(</rp><rt class="jpdb-reader-furi">よ</rt><rp>)</rp></ruby></span><span class="jpdb-reader-word" data-pitch-class="heiban">んで</span><span class="jpdb-reader-word jpdb-reader-has-furi" data-pitch-class="heiban"><ruby><span class="jpdb-reader-ruby-base">学</span><rp>(</rp><rt class="jpdb-reader-furi">まな</rt><rp>)</rp></ruby></span><span class="jpdb-reader-word" data-pitch-class="heiban">ぶ</span>
    </span>
  </main>
</body></html>`;
}

const server = await startLoopbackServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fixtureHtml());
}, 'Could not bind underline baseline smoke server');

const browser = await chromium.launch({ headless: process.env.YOMU_UNDERLINE_HEADED !== '1' });
try {
    const page = await browser.newPage({ viewport: { width: 900, height: 360 } });
    await page.goto(server.baseUrl, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.jpdb-reader-word');

    const measures = await page.evaluate(() => {
        return [...document.querySelectorAll('.jpdb-reader-word')].map(word => {
            const style = getComputedStyle(word);
            const after = getComputedStyle(word, '::after');
            const rect = word.getBoundingClientRect();
            return {
                text: word.textContent?.trim() ?? '',
                hasFuri: word.classList.contains('jpdb-reader-has-furi'),
                lineHeight: style.lineHeight,
                insetBlockEnd: after.insetBlockEnd || after.bottom,
                bottom: Math.round(rect.bottom * 100) / 100,
            };
        });
    });

    await page.screenshot({ path: join(ARTIFACTS, 'underline-baseline.png') });
    console.log(JSON.stringify(measures, null, 2));

    assert(measures.length >= 4, 'Expected the mixed furigana/plain reading line to render four words', { measures });
    const lineHeights = new Set(measures.map(m => m.lineHeight));
    assert(lineHeights.size === 1, 'Furigana and plain reader words must share one line-height so underlines align', { lineHeights: [...lineHeights], measures });
    const insets = new Set(measures.map(m => m.insetBlockEnd));
    assert(insets.size === 1, 'All reader-word underlines must use the same inset-block-end', { insets: [...insets], measures });
    // Same line-height + same inset means every word's box bottom (and thus its
    // underline) sits at the same y; confirm the rendered bottoms agree.
    const bottoms = measures.map(m => m.bottom);
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    assert(spread <= 1.5, 'Reader-word box bottoms (underline baselines) drifted apart', { spread, bottoms, measures });
    console.log(`Underline baseline smoke passed: lineHeight=${[...lineHeights][0]}, bottom spread=${spread}px`);
} finally {
    await browser.close();
    server.close();
}
