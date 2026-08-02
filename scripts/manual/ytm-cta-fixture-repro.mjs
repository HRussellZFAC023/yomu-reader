// Deterministic YouTube-origin repro for iPad's clipped mini-guide and Shorts
// labels. Ellipsis-constrained native chrome must stay page-owned while real
// page content remains annotated. Runs Chromium + WebKit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    installUserscriptFixtureBridge,
    mockJpdbApiRequest,
} from '../lib/smoke-harness.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT_PATH = resolve(ROOT, 'dist/yomu.user.js');
const RUNTIME_PATH = resolve(ROOT, process.env.YOMU_YTM_CTA_RUNTIME ?? 'dist/greasyfork/yomu-runtime.user.js');
const CSS_PATH = resolve(ROOT, 'dist/yomu.css');
assertBuiltArtifacts([SCRIPT_PATH, RUNTIME_PATH, CSS_PATH], ROOT, 'Run npm run build first.');
const USERSCRIPT = readFileSync(SCRIPT_PATH, 'utf8');
const RUNTIME = readFileSync(RUNTIME_PATH, 'utf8');
const CSS = readFileSync(CSS_PATH, 'utf8');

const VOCAB = [
    ['共有', '共有', 'きょうゆう', 'share', 'n', 900, 'new', 'heiban'],
    ['高く', '高い', 'たかく', 'high', 'adj', 300, 'known', 'atamadaka'],
    ['評価', '評価', 'ひょうか', 'rating', 'n', 700, 'new', 'heiban'],
    ['登録', '登録', 'とうろく', 'register', 'n', 800, 'new', 'heiban'],
    ['視聴', '視聴', 'しちょう', 'view', 'n', 1000, 'new', 'heiban'],
    ['回', '回', 'かい', 'times', 'ctr', 200, 'known', ''],
];

const FIXTURE_URL = 'https://m.youtube.com/shorts/yomu-clipped-labels';

const PAGE = `<!doctype html><meta charset="utf-8"><title>ytm cta fixture</title>
<body style="margin:0;background:#0f0f0f;color:#fff;font-family:Roboto,Arial,sans-serif">
<ytd-app>
  <ytd-mini-guide-renderer role="navigation" mini-guide-visible style="position:fixed;left:0;top:0;width:72px">
    <ytd-mini-guide-entry-renderer style="display:block;width:72px">
      <a id="endpoint" href="/" aria-label="ホーム" style="display:flex;flex-direction:column;align-items:center;width:72px">
        <span aria-hidden="true" style="width:24px;height:24px;background:#333;border-radius:4px"></span>
        <span class="title" id="home" style="display:block;max-width:36px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">ホーム</span>
      </a>
    </ytd-mini-guide-entry-renderer>
    <ytd-mini-guide-entry-renderer style="display:block;width:72px">
      <a id="endpoint" href="/feed/subscriptions" aria-label="登録チャンネル" style="display:flex;flex-direction:column;align-items:center;width:72px">
        <span aria-hidden="true" style="width:24px;height:24px;background:#333;border-radius:4px"></span>
        <span class="title" id="subscriptions" style="display:block;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px">登録チャンネル</span>
      </a>
    </ytd-mini-guide-entry-renderer>
  </ytd-mini-guide-renderer>
  <ytd-shorts>
  <main style="margin-left:80px">
  <yt-lockup-view-model>
    <h3><a id="video-title-link" href="/watch?v=jp" style="display:flex;width:240px;max-width:240px;color:#fff">
      <span id="video-title" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">日本語のニュースを見ます</span>
    </a></h3>
  </yt-lockup-view-model>
  <p id="content" style="padding:8px">動画の説明をここに書きます。今日は新しい動画です。</p>
  <!-- shorts action rail replica: icon column, fixed-width centered labels -->
  <ytd-reel-player-overlay-renderer>
    <div id="rail" style="position:fixed;right:8px;bottom:120px;width:64px;display:flex;flex-direction:column;gap:18px">
      <button style="all:unset;display:flex;flex-direction:column;align-items:center;width:64px">
        <span style="width:24px;height:24px;background:#333;border-radius:4px"></span>
        <span class="cta" id="like" style="display:block;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">高く評価</span>
      </button>
      <button style="all:unset;display:flex;flex-direction:column;align-items:center;width:64px">
        <span style="width:24px;height:24px;background:#333;border-radius:4px"></span>
        <span class="cta" id="share" style="display:block;max-width:28px;font-size:12px">共有</span>
      </button>
    </div>
  </ytd-reel-player-overlay-renderer>
  <!-- watch metadata row replica -->
  <div id="meta" style="width:390px;overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#aaa;padding:8px">275回視聴 3時間前</div>
  <!-- subscribe pill -->
  <button id="pill" style="border-radius:18px;background:#fff;color:#000;border:0;padding:0 16px;height:36px;font-size:14px;max-width:120px;overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap">チャンネル登録</button>
</main>
  </ytd-shorts>
</ytd-app>
<script>
  // Mark every fixture element framework-owned (React-fiber-style expando)
  // so the runtime routes them through the MIRROR channel like real ytm.
  for (const el of document.querySelectorAll('main, main *')) {
    el['__reactFiber$fixture'] = {};
  }
  // YouTube custom elements can add their text-overflow contract only after
  // Yomu's first pass. Wait until the Share label demonstrably owns a mirror,
  // then hydrate the real clipping styles; the lifecycle must tear it down.
  const lateClipTimer = setInterval(() => {
    const share = document.querySelector('#share');
    if (!share?.querySelector('.jpdb-reader-text-mirror')) return;
    share.dataset.yomuMirrorBeforeLateClip = 'true';
    share.style.overflow = 'hidden';
    share.style.textOverflow = 'ellipsis';
    share.style.whiteSpace = 'nowrap';
    clearInterval(lateClipTimer);
  }, 50);
</script></body>`;

// One cross-engine snapshot deliberately reports every geometry/ownership fact
// needed to diagnose a failed native-label contract.
// fallow-ignore-next-line complexity
function measure() {
    const out = { stamps: [...document.querySelectorAll('[data-yomu-clip-constrained]')].map(el => el.id || el.className), rows: [] };
    for (const el of document.querySelectorAll('#home, #subscriptions, .cta, #meta, #pill, #video-title, #content')) {
        const furi = [...el.querySelectorAll('.jpdb-reader-detached-furi')];
        const rect = el.getBoundingClientRect();
        out.rows.push({
            id: el.id,
            sourceText: [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''),
            overflowing: el.scrollWidth > el.clientWidth + 1,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            words: el.querySelectorAll('.jpdb-reader-word').length,
            mirrors: el.querySelectorAll('.jpdb-reader-text-mirror').length,
            mirrorBeforeLateClip: el.dataset.yomuMirrorBeforeLateClip === 'true',
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
    await page.route(`${FIXTURE_URL}**`, route => route.fulfill({ body: PAGE, contentType: 'text/html' }));
    await page.addInitScript(RUNTIME);
    await page.addInitScript(USERSCRIPT);
    await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#content');
    await page.waitForTimeout(14000);
    const result = await page.evaluate(measure);
    console.log(`== ${name}`, JSON.stringify(result, null, 1));
    assert(result.rows.some(row => row.id === 'content' && row.words > 0), `${name}: real YouTube content was not annotated`, result);
    assert(result.rows.some(row => row.id === 'video-title' && row.words > 0), `${name}: realistic YouTube video title was not annotated`, result);
    for (const [id, sourceText] of [['home', 'ホーム'], ['subscriptions', '登録チャンネル'], ['like', '高く評価'], ['share', '共有']]) {
        const row = result.rows.find(candidate => candidate.id === id);
        assert(row, `${name}: missing ${id} label`, result);
        assert(row.sourceText === sourceText, `${name}: ${id} native label text changed`, row);
        assert(row.words === 0 && row.mirrors === 0, `${name}: ${id} received a Yomu annotation mirror`, row);
        assert(!row.overflowing, `${name}: ${id} label still overflows into an ellipsis`, row);
    }
    const lateShare = result.rows.find(candidate => candidate.id === 'share');
    assert(lateShare?.mirrorBeforeLateClip, `${name}: Share was not annotated before late clipping hydrated`, lateShare);
    await browser.close();
}
