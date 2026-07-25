#!/usr/bin/env node
// Real-engine regression: a subtitle word must carry exactly ONE highlight
// layer.
//
// A furigana word wraps its kanji run in .jpdb-reader-ruby-base. When both the
// word and that child painted the translucent highlight gradient, the two
// composited over the kanji only, so the kanji rendered visibly darker than the
// okurigana in the same word — reported as "double highlight". The word box
// reserves no ruby row in flow (readings are detached), so the word is the
// correct single carrier. Only a real engine resolves this cascade, and only
// geometry proves the two boxes overlap.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const css = readFileSync(path.join(ROOT, 'dist', 'yomu.css'), 'utf8');

// Each highlight mode paints through its own rule set, so all four are checked.
const MODES = [
    'jpdb-reader-subtitle-highlight-status',
    'jpdb-reader-subtitle-highlight-jpdb',
    'jpdb-reader-subtitle-highlight-anki',
    'jpdb-reader-subtitle-highlight-pitch',
];

const fixture = mode => `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body class="${mode}">
  <div class="jpdb-subtitle-player">
    <div class="jpdb-subtitle-text">
      <div class="jpdb-subtitle-primary">
        <span class="jpdb-reader-word jpdb-reader-has-furi jpdb-not-in-deck jpdb-pitch-heiban"
              data-pitch-class="heiban" data-expression="連続">
          <span class="jpdb-reader-ruby-base">連続</span><span>する</span>
        </span>
        <span class="jpdb-reader-word jpdb-not-in-deck" data-expression="今日">今日</span>
      </div>
    </div>
  </div>
</body></html>`;

function fail(engine, message, detail) {
    throw new Error(`${engine}: ${message}\n${JSON.stringify(detail, null, 2)}`);
}

async function verifyEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
        for (const mode of MODES) {
            await page.setContent(fixture(mode), { waitUntil: 'domcontentloaded' });
            const result = await page.evaluate(() => {
                const paints = el => getComputedStyle(el).backgroundImage !== 'none';
                const word = document.querySelector('.jpdb-reader-word.jpdb-reader-has-furi');
                const base = word.querySelector('.jpdb-reader-ruby-base');
                const plain = document.querySelector('.jpdb-reader-word:not(.jpdb-reader-has-furi)');
                const rect = el => el.getBoundingClientRect();
                return {
                    wordPaints: paints(word),
                    basePaints: paints(base),
                    plainPaints: paints(plain),
                    // Coincident boxes are what make a second layer double the
                    // opacity rather than sit somewhere harmless.
                    boxesOverlapVertically: Math.abs(rect(word).top - rect(base).top) < 1
                        && Math.abs(rect(word).height - rect(base).height) < 1,
                    reservedRubyRow: Math.round(rect(word).height - rect(plain).height),
                };
            });

            if (!result.wordPaints || !result.plainPaints) {
                fail(name, `${mode}: subtitle word lost its highlight entirely`, result);
            }
            if (result.wordPaints && result.basePaints && result.boxesOverlapVertically) {
                fail(name, `${mode}: kanji run carries a doubled highlight layer`, result);
            }
            if (result.reservedRubyRow !== 0) {
                fail(name, `${mode}: furigana word reserves a ruby row in flow, so the word box is the wrong highlight carrier`, result);
            }
            console.log(`${name} ${mode}: word=${result.wordPaints} base=${result.basePaints}`);
        }
    } finally {
        await browser.close();
    }
}

await verifyEngine('chromium', chromium);
await verifyEngine('webkit', webkit);
console.log('subtitle highlight layers smoke passed');
