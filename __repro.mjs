#!/usr/bin/env node
// Repro: why do underline + text colour fail on Discord/ChatGPT while furigana shows?
// Prong A: controlled CSS-cascade matrix using the REAL built dist/yomu.css.
// Prong B: dump the real text-fill-color / text-decoration rules from live sites.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REPO = '/Users/heru/Documents/Projects/yomu/apps/yomu-reader';
const CSS = readFileSync(`${REPO}/dist/yomu.css`, 'utf8');

// A reader word as the pipeline builds it: anki text channel needs an anki state,
// pitch underline channel needs a known pitch, jpdb highlight needs a jpdb state.
const WORD_HTML = `<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-new anki-new jpdb-pitch-heiban jpdb-reader-has-furi"
  data-card-state="new" data-anki-state="new" data-card-source="jpdb" data-pitch-class="heiban" data-surface="漢字">
  <ruby><span class="jpdb-reader-ruby-base">漢字</span><rp>(</rp><rt class="jpdb-reader-furi">かんじ</rt><rp>)</rp></ruby>
</span>`;

const HOSTILE = {
  baseline: '',
  webkitFillImportant: `.host { -webkit-text-fill-color: rgb(210,210,210) !important; }`,
  webkitFillPlain:     `.host { -webkit-text-fill-color: rgb(210,210,210); }`,
  colorImportant:      `.host .deep .leaf { color: rgb(210,210,210) !important; }`,
  textDecorationNone:  `.host { text-decoration: none !important; }`,
  textDecorationNoneDeep: `.host * { text-decoration: none !important; }`,
  allRevert:           `.host { all: revert; }`,
  containPaint:        `.host { contain: content; overflow: hidden; }`,
};

const HTML = (hostile) => `<!doctype html><html class="jpdb-reader-theme-dark jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-pitch jpdb-reader-word-text-anki">
<head><meta charset="utf-8"><style>${CSS}</style><style>
body{background:#1e1f22;color:#dbdee1;font-size:32px;line-height:2.2}
.host{color:#dbdee1}
${hostile}
</style></head>
<body><div class="host"><div class="deep"><span class="leaf">これは ${WORD_HTML} です。</span></div></div></body></html>`;

function readWordStyle() {
  const word = document.querySelector('.jpdb-reader-word');
  const cs = getComputedStyle(word);
  const after = getComputedStyle(word, '::after');
  const furi = getComputedStyle(document.querySelector('.jpdb-reader-furi'));
  return {
    color: cs.color,
    webkitTextFillColor: cs.webkitTextFillColor,
    textDecorationLine: cs.textDecorationLine,
    afterBorderBottom: after.borderBottomColor,
    afterBorderWidth: after.borderBottomWidth,
    afterContent: after.content,
    backgroundImage: cs.backgroundImage.slice(0, 60),
    furiColor: furi.color,
    furiDisplay: furi.display,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log('================ PRONG A: controlled CSS cascade matrix ================');
for (const [name, hostile] of Object.entries(HOSTILE)) {
  await page.setContent(HTML(hostile), { waitUntil: 'load' });
  const s = await page.evaluate(readWordStyle);
  console.log(`\n--- ${name} ---`);
  console.log(JSON.stringify(s, null, 0));
}

console.log('\n\n================ PRONG B: live site text-fill / text-decoration rules ================');
const SITES = ['https://chatgpt.com/', 'https://discord.com/'];
for (const url of SITES) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const dump = await page.evaluate(() => {
      const hits = { fill: [], decoration: [], universalReset: [] };
      for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          const t = rule.cssText || '';
          if (/-webkit-text-fill-color\s*:/.test(t) && !/transparent|currentcolor|inherit/i.test(t.match(/-webkit-text-fill-color\s*:[^;}]*/i)?.[0] || '')) {
            if (hits.fill.length < 25) hits.fill.push(t.slice(0, 200));
          }
          if (/text-decoration(?:-line)?\s*:/.test(t)) {
            const decl = t.match(/text-decoration[^;}]*/i)?.[0] || '';
            if (!/none|inherit/i.test(decl) && hits.decoration.length < 25) hits.decoration.push(t.slice(0, 160));
          }
          const sel = rule.selectorText || '';
          if (/^\*(\s*,|\s*\{|::?)/.test(t) && /text-decoration|color|-webkit-text-fill/.test(t) && hits.universalReset.length < 15) {
            hits.universalReset.push(t.slice(0, 200));
          }
        }
      }
      // also: what does a representative paragraph actually compute?
      const probe = document.querySelector('p, span, div');
      const pc = probe ? getComputedStyle(probe) : null;
      return { url: location.href, hits, probeFill: pc?.webkitTextFillColor, probeColor: pc?.color, probeDecoration: pc?.textDecorationLine };
    });
    console.log(`\n#### ${url} -> ${dump.url}`);
    console.log('probe paragraph:', JSON.stringify({ fill: dump.probeFill, color: dump.probeColor, decoration: dump.probeDecoration }));
    console.log('FILL rules (', dump.hits.fill.length, '):'); dump.hits.fill.forEach(r => console.log('  ', r));
    console.log('DECORATION rules (', dump.hits.decoration.length, '):'); dump.hits.decoration.forEach(r => console.log('  ', r));
    console.log('UNIVERSAL resets (', dump.hits.universalReset.length, '):'); dump.hits.universalReset.forEach(r => console.log('  ', r));
  } catch (e) {
    console.log(`\n#### ${url} FAILED: ${String(e).slice(0, 200)}`);
  }
}

await browser.close();
