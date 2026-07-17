// Deterministic render-layer repro: ytm-Shorts-style CTA labels (fixed width,
// overflow-x hidden, ellipsis, nowrap) with ruby-bearing jpdb tokens. Does
// HEAD rest-hide the detached readings (fixed) or let them spill and
// truncate the base (bug)? Runs chromium + webkit.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright';
import { installUserscriptFixtureBridge, mockJpdbApiRequest, YOMU_SETTINGS_KEY } from '../lib/smoke-harness.mjs';

const USERSCRIPT = readFileSync(new URL('../../dist/yomu.user.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../dist/yomu.css', import.meta.url), 'utf8');

const VOCAB = [
    ['共有', '共有', 'きょうゆう', 'share', 'n', 900, 'new', 'heiban'],
    ['高く', '高い', 'たかく', 'high', 'adj', 300, 'known', 'atamadaka'],
    ['評価', '評価', 'ひょうか', 'rating', 'n', 700, 'new', 'heiban'],
    ['登録', '登録', 'とうろく', 'register', 'n', 800, 'new', 'heiban'],
    ['視聴', '視聴', 'しちょう', 'view', 'n', 1000, 'new', 'heiban'],
    ['回', '回', 'かい', 'times', 'ctr', 200, 'known', ''],
];

const PAGE = `<!doctype html><meta charset="utf-8"><title>ytm cta fixture</title>
<body style="margin:0;background:#0f0f0f;color:#fff;font-family:Roboto,Arial,sans-serif">
<main>
  <p style="padding:8px">動画の説明をここに書きます。今日は新しい動画です。</p>
  <!-- shorts action rail replica: icon column, fixed-width centered labels -->
  <div id="rail" style="position:fixed;right:8px;bottom:120px;width:64px;display:flex;flex-direction:column;gap:18px">
    <button style="all:unset;display:flex;flex-direction:column;align-items:center;width:64px">
      <span style="width:24px;height:24px;background:#333;border-radius:4px"></span>
      <span class="cta" id="like" style="display:block;max-width:64px;font-size:12px" data-late-clip="1">高く評価</span>
    </button>
    <button style="all:unset;display:flex;flex-direction:column;align-items:center;width:64px">
      <span style="width:24px;height:24px;background:#333;border-radius:4px"></span>
      <span class="cta" id="share" style="display:block;max-width:64px;font-size:12px" data-late-clip="1">共有</span>
    </button>
  </div>
  <!-- watch metadata row replica -->
  <div id="meta" style="width:390px;overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#aaa;padding:8px">275回視聴 3時間前</div>
  <!-- subscribe pill -->
  <button id="pill" style="border-radius:18px;background:#fff;color:#000;border:0;padding:0 16px;height:36px;font-size:14px;max-width:120px;overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap">チャンネル登録</button>
</main>
<script>
  // Mark every fixture element framework-owned (React-fiber-style expando)
  // so the runtime routes them through the MIRROR channel like real ytm.
  for (const el of document.querySelectorAll('main, main *')) {
    el['__reactFiber$fixture'] = {};
  }
  setTimeout(() => {
    for (const el of document.querySelectorAll('[data-late-clip]')) {
      el.style.overflowX = 'hidden';
      el.style.textOverflow = 'ellipsis';
      el.style.whiteSpace = 'nowrap';
    }
  }, 4000);
</script></body>`;

const server = createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(PAGE); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

function measure() {
    const out = { stamps: [...document.querySelectorAll('[data-yomu-clip-constrained]')].map(el => el.id || el.className), rows: [] };
    for (const el of document.querySelectorAll('.cta, #meta, #pill')) {
        const furi = [...el.querySelectorAll('.jpdb-reader-detached-furi')];
        const rect = el.getBoundingClientRect();
        out.rows.push({
            id: el.id,
            overflowing: el.scrollWidth > el.clientWidth + 1,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            words: el.querySelectorAll('.jpdb-reader-word').length,
            totalFuri: furi.length,
            visibleFuri: furi.filter(f => getComputedStyle(f).display !== 'none').length,
            spillingFuri: furi.filter(f => {
                if (getComputedStyle(f).display === 'none') return false;
                const fr = f.getBoundingClientRect();
                return fr.left < rect.left - 2 || fr.right > rect.right + 2;
            }).length,
            stamp: el.closest('[data-yomu-clip-constrained]')?.getAttribute('data-yomu-clip-constrained') ?? null,
            overflowOpened: el.getAttribute('data-yomu-detached-reading-overflow'),
            sig: (el.querySelector('.jpdb-reader-text-mirror') ?? el.closest('.jpdb-reader-text-mirror'))?.getAttribute('data-render-signature')?.slice(0, 220) ?? null,
            detachedFlag: (el.querySelector('.jpdb-reader-text-mirror') ?? el.closest('.jpdb-reader-text-mirror'))?.getAttribute('data-yomu-detached-readings') ?? null,
        });
    }
    return out;
}

const requestLog = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await installUserscriptFixtureBridge(page, {
        requestBridgeName: 'yomuFixtureBridge',
        requestHandler: request => mockJpdbApiRequest(request, requestLog, VOCAB) ?? { status: 404, responseText: '', bytes: [], contentType: '' },
        settings: { interfaceLanguage: 'ja', showFurigana: true, furiganaMode: 'all', apiKey: 'fixture-key', parserProvider: 'jpdb' },
        css: CSS,
    });
    await page.addInitScript(USERSCRIPT);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(14000);
    console.log(`== ${name}`, JSON.stringify(await page.evaluate(measure), null, 1));
    await browser.close();
}
server.close();
