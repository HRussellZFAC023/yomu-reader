import * as browsers from 'playwright';
import * as paths from 'node:path';
import * as harness from './smoke-harness.mjs';
import * as smokeHelpers from './smoke-test-helpers.mjs';
import * as files from 'node:fs';
function finishCell(code) { if (code) throw new Error('Merged smoke cell failed with exit code ' + code); }

// Former bookwalker-cty2-scroll-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertBookwalkerCty2Scroll(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { chromium, webkit, firefox } = browsers;
    const { default: path } = paths;
    const { createSmokePaths, addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } = harness;
    const { addScriptTagWithCspFallback, installUserscriptCssResource } = smokeHelpers;
// Regression proof for BookWalker cty=2 OCR (symptoms S1/S2/S3) in the REAL
// userscript: a single repainting BookWalker viewport + ?cty=2 + a tainted DRM
// canvas (mirror path) + a tapped partial-page retry region. Before the fix,
// within-page scroll changed either page identity or the region frame rect, so Yomu
// removed the frame and re-OCRed the same image repeatedly ("scanning never settles,
// hover dead, state lost on scroll"). Asserts:
//   A) page-1 OCRs (overlay lines appear)
//   B) within-page SCROLL keeps the overlay alive (no teardown, no re-OCR)  [S1/S3]
//   C) OCR line exposes hover-eligible words (data-vid/data-sid)            [S2]
//   D) a REAL page turn still re-OCRs the new page                          [guard]

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(_sourceDir);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuCty2Req';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/cty2-p1.png';
const IMG_URL_2 = 'https://c.bookwalker.jp/scrambled/cty2-p2.png';

const PAGE_PNG = makePng(400,560,false);
const PAGE_PNG_2 = makePng(400,560,true);

const SETTINGS = { onboardingSeen:true, interfaceLanguage:'en', apiKey:'', ankiEnabled:false, audioEnabled:false, enableLogging:false, ocrEnabled:true, ocrAutoScanImages:true, ocrShowTextOverlay:true, ocrProvider:'local-service', ocrEndpointUrl:'http://127.0.0.1:7331/ocr' };
const MOCK_OCR = { width:800, height:1130, lines:[{ text:'大変な事になった', box:{x:60,y:210,w:420,h:64}, vertical:false }] };

// Single vertical viewport: one canvas in a tall scrollable body. No second distinct
// page layout and no vertical page-run → shouldUseBookwalkerScrollSignature=true.
function fixtureHtml() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>html,body{margin:0;background:#111;min-height:3200px}
#viewer{position:relative}
#viewport0{position:absolute;top:40px;left:50%;transform:translateX(-50%)}
canvas.default{display:block;width:760px;height:1064px;background:#fff}
#pageSliderCounter{position:fixed;right:16px;bottom:12px;color:#fff}</style></head>
<body><div id="viewer"><div id="viewport0" class="currentScreen"><canvas class="default" id="c0" width="800" height="1130"></canvas></div></div>
<span id="pageSliderCounter">5 / 200</span>
<script>
window.__draw = async (n=1) => {
  const img = new Image(); img.src = (n===2)? ${JSON.stringify(IMG_URL_2)} : ${JSON.stringify(IMG_URL)};
  try { await img.decode(); } catch(e){ return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) {
    const x = c.getContext('2d'); x.clearRect(0,0,c.width,c.height);
    const buf = document.createElement('canvas'); buf.width=c.width; buf.height=c.height;
    const b = buf.getContext('2d'); b.fillStyle='#fff'; b.fillRect(0,0,c.width,c.height);
    b.drawImage(img,0,0,c.width,c.height);                       // cross-origin → taints buf
    x.drawImage(buf,0,0,c.width,c.height,0,0,c.width,c.height);  // composite → taints c0
  }
  return 'drawn';
};
window.__frameRemovals = 0;
new MutationObserver(ms=>{for(const m of ms)for(const n of m.removedNodes){if(n.nodeType===1&&(n.matches?.('.jpdb-ocr-canvas-frame')||n.querySelector?.('.jpdb-ocr-canvas-frame')))window.__frameRemovals++;}}).observe(document.documentElement,{childList:true,subtree:true});
window.__state = () => ({
  lines: document.querySelectorAll('.jpdb-ocr-line').length,
  words: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word[data-vid][data-sid]').length,
  frames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
  removals: window.__frameRemovals,
});
</script></body></html>`;
}

async function run(engineName) {
  const engine = engineName==='webkit'?webkit:engineName==='firefox'?firefox:chromium;
  const browser = _hostBrowser;
  const context = await browser.newContext({ viewport:{width:1000,height:900}, locale:'ja-JP', bypassCSP:true });
  const page = await context.newPage();
  let ocrHits = 0;
  await page.exposeFunction(BRIDGE, async req => {
    const u = req.url||'';
    if (u===IMG_URL) return { status:200, bytes:[...PAGE_PNG], contentType:'image/png', responseText:'' };
    if (u===IMG_URL_2) return { status:200, bytes:[...PAGE_PNG_2], contentType:'image/png', responseText:'' };
    if (/7331|\/ocr(\?|$)/.test(u)) { ocrHits++; return { status:200, responseText:JSON.stringify(MOCK_OCR) }; }
    return { status:503, responseText:'' };
  });
  await addGmStorageBridgeInitScript(page, { key:YOMU_SETTINGS_KEY, value:SETTINGS, requestBridgeName:BRIDGE });
  await context.route('**/*', route => {
    const r = route.request().url();
    if (r.startsWith('blob:')||r.startsWith('data:')) return route.continue();
    const u = new URL(r);
    if (u.href===IMG_URL) return route.fulfill({status:200,contentType:'image/png',body:PAGE_PNG});
    if (u.href===IMG_URL_2) return route.fulfill({status:200,contentType:'image/png',body:PAGE_PNG_2});
    if (u.hostname==='viewer.bookwalker.jp') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixtureHtml()});
    return route.fulfill({status:404,body:''});
  });

  await page.goto('https://viewer.bookwalker.jp/03/30/viewer.html?cid=test&cty=2', { waitUntil:'domcontentloaded', timeout:30000 });
  await installUserscriptCssResource(page, CSS_PATH).catch(()=>page.addStyleTag({path:CSS_PATH}));
  for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(()=>{});
  await addScriptTagWithCspFallback(page, SCRIPT_PATH);
  await page.waitForTimeout(900);
  await page.evaluate(()=>window.__draw(1));

  const st = () => page.evaluate(()=>window.__state());
  const waitFor = async (pred, ms=9000) => { const t=Date.now(); while(Date.now()-t<ms){ if(await pred()) return Date.now()-t; await page.waitForTimeout(120);} return -1; };
  const tapCenter = async () => { const p = await page.evaluate(()=>{const r=document.querySelector('#c0').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+120)};}); await page.mouse.move(p.x,p.y); await page.mouse.click(p.x,p.y); };
  await tapCenter();

  const aMs = await waitFor(async()=>(await st()).lines>=1);
  const afterPage1 = await st();
  const hitsAfterPage1 = ocrHits;
  const wordsOk = afterPage1.words >= 1;

  // within-page scroll — overlay must survive (no teardown, no re-OCR)  [S1/S3]
  await page.evaluate(()=>{ window.__frameRemovals = 0; });
  await page.evaluate(()=>window.scrollBy(0,80));
  await page.waitForTimeout(2200);
  const afterScroll = await st();
  const scrollReOcr = ocrHits - hitsAfterPage1;
  const overlaySurvived = afterScroll.lines>=1;
  const noReOcr = scrollReOcr===0;
  const noTeardown = afterScroll.removals===0;
  const sceneB = overlaySurvived && noReOcr && noTeardown;

  // real page turn — must re-OCR the new page  [guard]
  const hitsBeforeTurn = ocrHits;
  await page.evaluate(()=>{ const c=document.querySelector('#pageSliderCounter'); if(c) c.textContent='6 / 200'; });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.__draw(2));
  await page.waitForTimeout(300);
  await tapCenter();
  const turnMs = await waitFor(async()=> ocrHits>hitsBeforeTurn && (await st()).lines>=1);
  const turnOk = turnMs>=0;

  await context.close(); undefined;

  console.log(`[${engineName}] A page1-OCR: ${aMs>=0?aMs+'ms':'NO OVERLAY'} (lines=${afterPage1.lines})`);
  console.log(`[${engineName}] C words(S2): ${wordsOk?'OK':'NONE'} (words=${afterPage1.words})`);
  console.log(`[${engineName}] B scroll-survive(S1/S3): ${sceneB?'PASS':'FAIL'} (lines ${afterPage1.lines}->${afterScroll.lines}, reOCR=${scrollReOcr}, teardowns=${afterScroll.removals})`);
  console.log(`[${engineName}] D real-turn re-OCR: ${turnOk?'PASS '+turnMs+'ms':'FAIL (new page not OCRd)'}`);
  return { engineName, page1Ok:aMs>=0, wordsOk, scrollSurvive:sceneB, turnOk };
}

const engines = (process.env.ENGINES||'chromium,firefox,webkit').split(',').filter(Boolean);
const results = [];
for (const e of engines.filter(name => name === _hostEngine)) { try { results.push(await run(e)); } catch(err){ console.log(`[${e}] ERROR ${String(err).slice(0,200)}`); results.push({engineName:e,page1Ok:false,scrollSurvive:false,turnOk:false}); } }
console.log('\n==== SUMMARY ====');
let fails = 0;
for (const r of results) { const ok = r.page1Ok && r.scrollSurvive && r.turnOk; if(!ok) fails++; console.log(`${r.engineName}: page1=${r.page1Ok} words=${r.wordsOk} scrollSurvive=${r.scrollSurvive} realTurn=${r.turnOk} => ${ok?'OK':'FAIL'}`); }
console.log(fails ? `\nFAILURES: ${fails}` : '\nALL PASS — cty=2 within-page scroll keeps the OCR overlay; real turns still re-OCR.');
finishCell(fails?1:0);

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former bookwalker-tap-passthrough-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertBookwalkerTapPassthrough(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    const _sourceDir = new URL('..', import.meta.url).pathname;
    const { chromium, firefox, webkit } = browsers;
    const { default: path } = paths;
    const { mkdirSync, writeFileSync } = files;
    const { createSmokePaths, addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } = harness;
    const { addScriptTagWithCspFallback, installUserscriptCssResource } = smokeHelpers;
// Browser proof that tapping OCR text on a BookWalker-style viewer looks the word
// up instead of turning the page. NFBR turns the page on a touchend/click on its
// canvas; Yomu's OCR overlay sits on top, but on touch WebKit can target the
// underlying canvas even when the OCR word is painted on top — so without the fix
// a text tap both misses the lookup AND flips the page (the reported bug). The fix
// (1) never re-scans when the tap point is over existing OCR text (so the overlay
// survives the tap) and (2) swallows the gesture at document-capture when it lands
// on the overlay (so the viewer's turn handler never fires). Asserts: a tap on the
// word turns the page 0 times AND opens the lookup; a tap on bare canvas still turns.
// Uses a plain WebKit/Chromium touch context (NOT devices['iPad …']) because the
// mobile-emulation screen scale desyncs tap(x,y) from layout coordinates.
// Requires `npm run build` first (OCR ships in the yomu-video companion).

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST, artifacts: ARTIFACTS } = createSmokePaths(_sourceDir);
const ARTIFACT_DIR = path.join(ARTIFACTS, 'bookwalker-tap-passthrough');
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuTapRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-001.png';

const PAGE_PNG = makePng();

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
<div id="bookContainer"><div class="wideScreen"><canvas class="default" id="c0" width="800" height="1130" style="width:760px;height:auto;background:#fff"></canvas></div></div>
<div>Page <span id="pageSliderCounter">1 / 10</span></div>
<script>
window.__turns = 0;
const turn = () => { window.__turns++; };
window.__armTurn = () => { for (const t of ['touchend','click']) { document.querySelector('#c0').addEventListener(t, turn); document.addEventListener(t, turn); } };
window.__draw = async () => { const img = new Image(); img.src = ${JSON.stringify(IMG_URL)}; try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) { const x = c.getContext('2d'); x.clearRect(0,0,c.width,c.height); const b = document.createElement('canvas'); b.width=c.width; b.height=c.height; const bx=b.getContext('2d'); bx.fillStyle='#fff'; bx.fillRect(0,0,c.width,c.height); bx.drawImage(img,0,0,c.width,c.height); x.drawImage(b,0,0,c.width,c.height,0,0,c.width,c.height); } return 'drawn'; };
</script></body></html>`;
}
const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr', lookupOnClick: true, popupActivationMode: 'click' };
const MOCK_OCR = { width: 800, height: 1130, lines: [{ text: 'ずっと秘密にしていた', box: { x: 40, y: 160, w: 420, h: 90 }, vertical: false }] };
const POPOVER_SEL = '.jpdb-reader-popover[data-jpdb-reader-root="true"]';
const failures = [];
const rows = [];
mkdirSync(ARTIFACT_DIR, { recursive: true });

async function runCase(engineName) {
    const engine = engineName === 'webkit' ? webkit : engineName === 'firefox' ? firefox : chromium;
    const browser = _hostBrowser;
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
    const page = await ctx.newPage();
    await page.exposeFunction(BRIDGE, async req => { const u = req.url || ''; if (u === IMG_URL) return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' }; if (/7331|\/ocr(\?|$)/.test(u)) return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; return { status: 503, responseText: '' }; });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    await ctx.route('**/*', r => { const url = r.request().url(); if (url.startsWith('blob:') || url.startsWith('data:')) return r.continue(); const u = new URL(url); if (u.href === IMG_URL) return r.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG }); if (u.hostname === 'viewer.bookwalker.jp') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml() }); return r.fulfill({ status: 404, body: '' }); });
    await page.goto('https://viewer.bookwalker.jp/de_x/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }).catch(() => {}));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(300);
    // Scan the page (a bare-canvas tap — the genuine turn zone — renders the overlay).
    const c = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 110) }; });
    await page.touchscreen.tap(c.x, c.y);
    let rendered = false; const start = Date.now();
    while (Date.now() - start < 8000) { if (await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1) { rendered = true; break; } await page.waitForTimeout(100); }
    // Arm the page-turn handlers now (so the scan tap above doesn't count).
    await page.evaluate(() => { window.__armTurn(); window.__turns = 0; });
    // 1) Control FIRST (before any lookup popover can cover the margin): a bare-canvas
    // tap with no OCR text MUST still turn the page (we only swallow over the overlay).
    const margin = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width - 14), y: Math.round(r.top + r.height - 14) }; });
    await page.touchscreen.tap(margin.x, margin.y);
    await page.waitForTimeout(300);
    const marginTurns = await page.evaluate(() => window.__turns);
    // Re-scan settles the overlay back; wait for the word again, then reset the counter.
    const restart = Date.now();
    while (Date.now() - restart < 6000) { if (await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1) break; await page.waitForTimeout(100); }
    await page.evaluate(() => { window.__turns = 0; });
    const w = await page.evaluate(() => {
        const baseText = word => {
            const copy = word.cloneNode(true);
            copy.querySelectorAll('.jpdb-reader-furi, rt, rp').forEach(node => node.remove());
            if (copy.hasAttribute('data-yomu-ocr-visual-text')) return copy.getAttribute('data-yomu-ocr-visual-text');
            for (const glyph of copy.querySelectorAll('[data-yomu-ocr-visual-text]')) glyph.textContent = glyph.getAttribute('data-yomu-ocr-visual-text');
            return copy.textContent?.trim();
        };
        const el = [...document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')].find(word => baseText(word) === '秘密');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    if (!w) throw new Error(`${engineName}: recognized 秘密 has no visible word tap target`);
    const scannerIsolated = await page.evaluate(() => {
        const line = document.querySelector('.jpdb-ocr-line');
        if (!line) return false;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const visualText = [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
            .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
            .join('');
        return walker.nextNode() === null && visualText === 'ずっと秘密にしていた';
    });
    // 2) Tap the WORD: must NOT turn, must open the lookup, must keep the overlay.
    await page.touchscreen.tap(w.x, w.y);
    let popover = false;
    try {
        await page.waitForFunction(s => {
            const root = document.querySelector(s);
            return Boolean(
                root
                && root.getAttribute('role') === 'dialog'
                && root.querySelector('.jpdb-reader-popover-body')
                // Exact, with furigana rt/rp stripped: renderRuby interleaves
                // `<rp>(</rp>…<rp>)</rp>`, and `includes` would also pass for a
                // popover showing a longer word that merely contains this one.
                && (() => {
                    const spelling = root.querySelector('.jpdb-reader-spelling');
                    if (!spelling) return false;
                    const clone = spelling.cloneNode(true);
                    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
                    return (clone.textContent ?? '').replace(/\s+/gu, '') === '秘密';
                })()
            );
        }, POPOVER_SEL, { timeout: 6000 });
        popover = true;
    } catch {
        popover = false;
    }
    const wordTurns = await page.evaluate(() => window.__turns);
    const overlayKept = await page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length) >= 1;
    const screenshot = path.join(ARTIFACT_DIR, `${engineName}.png`);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => undefined);

    const ok = rendered && w && scannerIsolated && wordTurns === 0 && popover && overlayKept && marginTurns > 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${engineName} — wordTurns=${wordTurns}(want 0) lookup=${popover} scannerIsolated=${scannerIsolated} overlayKept=${overlayKept} marginTurns=${marginTurns}(want >0)${rendered ? '' : ' [overlay never rendered]'}`);
    rows.push({ engineName, ok, rendered, wordTurns, popover, scannerIsolated, overlayKept, marginTurns, screenshot });
    if (!ok) failures.push(engineName);
    await ctx.close();

}

for (const engineName of [_hostEngine]) {
    try { await runCase(engineName); } catch (e) { console.log(`ERROR ${engineName}: ${String(e).slice(0, 160)}`); failures.push(engineName); }
}
writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(rows, null, 2));
console.log(failures.length ? `\nFAILURES: ${[...new Set(failures)].join(', ')}` : `\nALL PASS — OCR text taps look up the word without turning the page; bare taps still turn. Artifacts: ${ARTIFACT_DIR}`);
finishCell(failures.length ? 1 : 0);

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}

// Former bookwalker-tap-retry-smoke: the host owns the browser; this cell owns its isolated scenario.
export async function assertBookwalkerTapRetry(_hostBrowser, _hostEngine) {
    const existingContexts = new Set(_hostBrowser.contexts());
    try {

    if (_hostEngine === 'firefox') return;
const _sourceDir = new URL('..', import.meta.url).pathname;
    const { chromium, webkit } = browsers;
    const { default: path } = paths;
    const { createSmokePaths, addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } = harness;
    const { addScriptTagWithCspFallback, installUserscriptCssResource } = smokeHelpers;
// Browser proof that a BookWalker canvas tap whose page is composited BUT whose OCR
// capture isn't ready yet still OCRs on its own — without a second tap. In tap/manual
// mode the background poll never spends an OCR call; only a user tap captures. When
// the tapped page's tainted-canvas mirror rebuild transiently fails (the origin-clean
// page image hasn't finished loading / the GM fetch races — common right after a turn,
// especially on a REVISITED page the engine settles a beat late), the first capture
// returns nothing and schedules a retry. That retry runs through
// refreshCanvasReaderSurfaces, which early-returns in tap mode unless the capture is
// re-flagged user-requested — so before the fix the page stayed blank with NO
// "Scanning…"/"Text ready" pill until the user tapped again (the reported
// "sometimes a page just has no OCR" bug). The page is already composited at tap time
// (stable page signature, exactly like a real tap), so this isolates the retry-mode
// bug rather than a spurious turn. Uses a plain touch context (NOT devices['iPad …']:
// the mobile-emulation scale desyncs tap(x,y) from layout). Requires `npm run build`.

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(_sourceDir);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuTapRetryRequest';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/page-001.png';

const PAGE_PNG = makePng();

function fixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>
<div id="bookContainer"><div class="wideScreen"><canvas class="default" id="c0" width="800" height="1130" style="width:760px;height:auto;background:#fff"></canvas></div></div>
<div>Page <span id="pageSliderCounter">1 / 10</span></div>
<script>
// NFBR-faithful paint: clear, render into an off-screen buffer, composite buffer->screen.
// The cross-origin image taints the canvas, so OCR must replay the recorded mirror ops.
window.__draw = async () => { const img = new Image(); img.src = ${JSON.stringify(IMG_URL)}; try { await img.decode(); } catch (e) { return 'decode-failed'; }
  for (const c of document.querySelectorAll('canvas.default')) { const x = c.getContext('2d'); x.clearRect(0,0,c.width,c.height); const b = document.createElement('canvas'); b.width=c.width; b.height=c.height; const bx=b.getContext('2d'); bx.fillStyle='#fff'; bx.fillRect(0,0,c.width,c.height); bx.drawImage(img,0,0,c.width,c.height); x.drawImage(b,0,0,c.width,c.height,0,0,c.width,c.height); } return 'drawn'; };
</script></body></html>`;
}
// Tap/manual mode (ocrAutoScanImages:false) — the poll must NOT auto-OCR; only a tap does.
const SETTINGS = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, audioEnabled: false, enableLogging: false, ocrEnabled: true, ocrAutoScanImages: false, ocrShowTextOverlay: true, ocrProvider: 'local-service', ocrEndpointUrl: 'http://127.0.0.1:7331/ocr' };
const MOCK_OCR = { width: 800, height: 1130, lines: [{ text: '大変な事', box: { x: 40, y: 160, w: 420, h: 90 }, vertical: false }] };
const failures = [];
const rows = [];

// mode 'ready'         : page composited + image fetchable before the tap (control — must work).
// mode 'mirror-delayed': page composited, but the origin-clean page image isn't fetchable
//                        until ~300ms after the tap (mirror rebuild fails on the first
//                        attempt). The page signature is STABLE the whole time (no turn),
//                        so only the retry-mode bug can keep it blank. ONE tap, no second.
async function runCase(engineName, mode) {
    const engine = engineName === 'webkit' ? webkit : chromium;
    const label = `${engineName}/${mode}`;
    const browser = _hostBrowser;
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, hasTouch: true, locale: 'ja-JP', bypassCSP: true });
    const page = await ctx.newPage();
    let ocrHits = 0;
    let cleanImageFetchable = mode !== 'mirror-delayed'; // gates the GM clean-image fetch only
    // Bridge handles GM_xmlhttpRequest: the origin-clean mirror image AND the OCR endpoint.
    // Failing IMG_URL here (not in the page route below) models the clean copy being
    // momentarily unavailable while the page itself stays painted/tainted on screen.
    await page.exposeFunction(BRIDGE, async req => {
        const u = req.url || '';
        if (u === IMG_URL) { if (!cleanImageFetchable) return { status: 503, responseText: '' }; return { status: 200, bytes: [...PAGE_PNG], contentType: 'image/png', responseText: '' }; }
        if (/7331|\/ocr(\?|$)/.test(u)) { ocrHits++; return { status: 200, responseText: JSON.stringify(MOCK_OCR) }; }
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: SETTINGS, requestBridgeName: BRIDGE });
    // The page's OWN image load (used by __draw to paint+taint the canvas) always succeeds.
    await ctx.route('**/*', r => { const url = r.request().url(); if (url.startsWith('blob:') || url.startsWith('data:')) return r.continue(); const u = new URL(url); if (u.href === IMG_URL) return r.fulfill({ status: 200, contentType: 'image/png', body: PAGE_PNG }); if (u.hostname === 'viewer.bookwalker.jp') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml() }); return r.fulfill({ status: 404, body: '' }); });
    await page.goto('https://viewer.bookwalker.jp/de_x/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }).catch(() => {}));
    for (const c of COMPANIONS) await addScriptTagWithCspFallback(page, c).catch(() => {});
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForTimeout(900);

    // Composite the page FIRST so the canvas is painted + the mirror ops are recorded
    // and the page signature is settled — exactly the state a user taps in.
    await page.evaluate(() => window.__draw());
    await page.waitForTimeout(300);

    const p = await page.evaluate(() => { const r = document.querySelector('#c0').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 110) }; });
    await page.touchscreen.tap(p.x, p.y); // exactly one tap
    if (mode === 'mirror-delayed') { await page.waitForTimeout(300); cleanImageFetchable = true; } // page image becomes available shortly after

    const lineCount = () => page.evaluate(() => document.querySelectorAll('.jpdb-ocr-line').length);
    const start = Date.now(); let ms = -1;
    while (Date.now() - start < 8000) { if (await lineCount() >= 1) { ms = Date.now() - start; break; } await page.waitForTimeout(100); }
    const ok = ms >= 0 && ocrHits >= 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} — overlay ${ms >= 0 ? ms + 'ms' : 'NEVER (no pill, blank page)'} (ocrHits=${ocrHits}, single tap only)`);
    if (!ok) failures.push(label);
    rows.push({ label, ok });
    await ctx.close();

}

for (const engineName of [_hostEngine]) {
    for (const mode of ['ready', 'mirror-delayed']) {
        try { await runCase(engineName, mode); }
        catch (e) { const label = `${engineName}/${mode}`; console.log(`ERROR ${label}: ${String(e).slice(0, 160)}`); failures.push(`${label} crashed`); }
    }
}
console.log('\n================ SUMMARY ================');
for (const r of rows) console.log(`${r.label.padEnd(28)} ${r.ok ? 'OCR ok' : 'NO OCR'}`);
console.log(failures.length ? `\nFAILURES (${failures.length}): ${[...new Set(failures)].join('; ')}` : '\nALL PASS — a tap whose capture isn\'t ready yet still OCRs without a second tap');
finishCell(failures.length ? 1 : 0);

    } finally {
        for (const context of _hostBrowser.contexts()) {
            if (!existingContexts.has(context)) await context.close();
        }
    }
}
