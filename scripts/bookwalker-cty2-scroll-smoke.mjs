#!/usr/bin/env node
// Regression proof for BookWalker cty=2 OCR (symptoms S1/S2/S3) in the REAL
// userscript: a single repainting BookWalker viewport + ?cty=2 + a tainted DRM
// canvas (mirror path) + a tapped partial-page retry region. Before the fix,
// within-page scroll changed either page identity or the region frame rect, so Yomu
// removed the frame and re-OCRed the same image repeatedly ("scanning never settles,
// hover dead, state lost on scroll"). Asserts:
//   A) page-1 OCRs (overlay lines appear)
//   B) within-page SCROLL keeps the overlay alive (no teardown, no re-OCR)  [S1/S3]
//   C) OCR line exposes lookup hit targets
//   D) a REAL page turn still re-OCRs the new page                          [guard]
//   E) page turns retire the previous page's text AND interactive hit targets
//   F) a previous page's delayed OCR answer cannot paint a later page
// This is a deterministic viewer-mechanics fixture, not a live BookWalker book.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { addGmStorageBridgeInitScript, makePng, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { bookwalkerSmokePaths, openBookwalkerSmoke, bootBookwalkerSmoke, routeBookwalkerFixture } from './lib/bookwalker-smoke.mjs';

const PATHS = bookwalkerSmokePaths(import.meta.dirname, 'bookwalker-page-turn');
const ARTIFACT_DIR = PATHS.artifactDir;
const BRIDGE = '__yomuCty2Req';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/cty2-p1.png';
const IMG_URL_2 = 'https://c.bookwalker.jp/scrambled/cty2-p2.png';
const IMG_URL_3 = 'https://c.bookwalker.jp/scrambled/cty2-p3.png';

const PAGE_PNG = makePng(400,560,false);
const PAGE_PNG_2 = makePng(400,560,true);
const PAGE_PNG_3 = makePng(401,560,false);
const PAGE_TEXT = ['大変な事になった', '昨日の古い結果', '明日の新しい文章'];

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
  const img = new Image(); img.src = ${JSON.stringify([IMG_URL, IMG_URL_2, IMG_URL_3])}[n-1];
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
  hitTargets: document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word').length,
  frames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
  removals: window.__frameRemovals,
  texts: [...document.querySelectorAll('.jpdb-ocr-line')].map(line => line.dataset.ocrText),
  oldTargetsConnected: window.__oldTargets?.some(node => node.isConnected) ?? false,
  oldTargetWasPresent: window.__oldTargets?.some(node => node.matches('.jpdb-reader-word')) ?? false,
});
</script></body></html>`;
}

async function run(engineName, autoScan, readerMode) {
  const caseName = `${readerMode}-${autoScan ? 'auto' : 'manual'}`;
  const label = `${engineName}/${caseName}`;
  const { browser, context, page } = await openBookwalkerSmoke(engineName, { viewport: { width: 1000, height: 900 } });
  const { fixture, releaseOldAnswer } = await installPageTurnFixture(page, context, autoScan);

  await page.goto(`https://viewer.bookwalker.jp/03/30/viewer.html?cid=test&cty=${readerMode === 'cty2' ? 2 : 1}`, { waitUntil:'domcontentloaded', timeout:30000 });
  await bootBookwalkerSmoke(page, PATHS);
  await page.evaluate(()=>window.__draw(1));

  const st = () => page.evaluate(()=>window.__state());
  const waitFor = async (pred, ms=9000) => { const t=Date.now(); while(Date.now()-t<ms){ if(await pred()) return Date.now()-t; await page.waitForTimeout(120);} return -1; };
  const tapCenter = async () => { const p = await page.evaluate(()=>{const r=document.querySelector('#c0').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+120)};}); await page.mouse.move(p.x,p.y); await page.mouse.click(p.x,p.y); };
  await tapCenter();

  const aMs = await waitFor(async()=>(await st()).texts.includes(PAGE_TEXT[0]));
  const afterPage1 = await st();
  const hitsAfterPage1 = fixture.ocrHits;
  const wordsOk = afterPage1.hitTargets >= 1;

  // within-page scroll — overlay must survive (no teardown, no re-OCR)  [S1/S3]
  await page.evaluate(()=>{ window.__frameRemovals = 0; });
  await page.evaluate(()=>window.scrollBy(0,80));
  await page.waitForTimeout(2200);
  const afterScroll = await st();
  const scrollReOcr = fixture.ocrHits - hitsAfterPage1;
  const overlaySurvived = afterScroll.lines>=1;
  const noReOcr = scrollReOcr===0;
  const noTeardown = afterScroll.removals===0;
  const sceneB = [overlaySurvived, noReOcr, noTeardown].every(Boolean);

  const { beforeSecondTap, waitingForPage2, targetsRetired, manualWaitsForTap,
    turnMs, beforeLateAnswer, afterLateAnswer, latePaints, lateAnswerIgnored,
  } = await assertPageTurnTargetsRetire({ page, fixture, releaseOldAnswer, autoScan, waitFor, tapCenter, st });
  const turnOk = [targetsRetired, manualWaitsForTap, lateAnswerIgnored].every(Boolean);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${engineName}-${caseName}.png`) });
  writeFileSync(path.join(ARTIFACT_DIR, `${engineName}-${caseName}.json`), JSON.stringify({
    fixture: true, label, requests: fixture.requests, afterPage1, afterScroll, beforeSecondTap, waitingForPage2,
    beforeLateAnswer, afterLateAnswer, latePaints, targetsRetired, manualWaitsForTap, lateAnswerIgnored,
  }, null, 2));

  await context.close(); await browser.close();

  reportPageTurnCase({ label, aMs, afterPage1, wordsOk, sceneB, afterScroll, scrollReOcr,
    turnOk, targetsRetired, manualWaitsForTap, lateAnswerIgnored, turnMs });
  return { engineName: label, page1Ok:aMs>=0, wordsOk, scrollSurvive:sceneB, turnOk };
}

const PAGE_IMAGES = new Map([[IMG_URL, PAGE_PNG], [IMG_URL_2, PAGE_PNG_2], [IMG_URL_3, PAGE_PNG_3]]);

async function installPageTurnFixture(page, context, autoScan) {
  const fixture = { ocrHits: 0, currentPage: 1, requests: [] };
  let releaseOldAnswer;
  const oldAnswer = new Promise(resolve => { releaseOldAnswer = resolve; });
  await page.exposeFunction(BRIDGE, async req => {
    const u = req.url||'';
    const image = PAGE_IMAGES.get(u);
    if (image) return { status:200, bytes:[...image], contentType:'image/png', responseText:'' };
    if (/7331|\/ocr(\?|$)/.test(u)) {
      fixture.ocrHits++;
      const requestedPage = fixture.currentPage;
      fixture.requests.push({ page: requestedPage, phase: 'requested' });
      if (requestedPage === 2) await oldAnswer;
      fixture.requests.push({ page: requestedPage, phase: 'answered' });
      return { status:200, responseText:JSON.stringify({ ...MOCK_OCR, lines: [{ ...MOCK_OCR.lines[0], text: PAGE_TEXT[requestedPage-1] }] }) };
    }
    return { status:503, responseText:'' };
  });
  await addGmStorageBridgeInitScript(page, { key:YOMU_SETTINGS_KEY, value:{ ...SETTINGS, ocrAutoScanImages: autoScan }, requestBridgeName:BRIDGE });
  await routeBookwalkerFixture(context, PAGE_IMAGES, fixtureHtml());
  return { fixture, releaseOldAnswer };
}

async function assertPageTurnTargetsRetire({ page, fixture, releaseOldAnswer, autoScan, waitFor, tapCenter, st }) {
  // Retain the actual old hit targets: a new overlay alone is not proof they retired.
  await page.evaluate(() => { window.__oldTargets = [...document.querySelectorAll('.jpdb-ocr-line, .jpdb-ocr-line .jpdb-reader-word')]; });
  // Delay page 2's provider answer, then turn again while it is still in flight.
  const hitsBeforeTurn = fixture.ocrHits;
  fixture.currentPage = 2;
  await page.evaluate(()=>{ const c=document.querySelector('#pageSliderCounter'); if(c) c.textContent='6 / 200'; });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>window.__draw(2));
  const retiredMs = await waitFor(async() => {
    const state = await st();
    return !state.oldTargetsConnected && !state.texts.includes(PAGE_TEXT[0]) && (autoScan || state.frames === 0);
  });
  const beforeSecondTap = await st();
  const manualWaitsForTap = autoScan || [fixture.ocrHits === hitsBeforeTurn, beforeSecondTap.lines === 0, beforeSecondTap.frames === 0].every(Boolean);
  await tapCenter();
  const secondRequestMs = await waitFor(async()=> fixture.ocrHits>hitsBeforeTurn);
  const waitingForPage2 = await st();
  const targetsRetired = [retiredMs >= 0, beforeSecondTap.oldTargetWasPresent,
    !waitingForPage2.oldTargetsConnected, waitingForPage2.lines === 0].every(Boolean);

  const late = await assertLatePageAnswerIgnored({ page, fixture, releaseOldAnswer, autoScan, waitFor, tapCenter, st, secondRequestMs });
  return { beforeSecondTap, waitingForPage2, targetsRetired, manualWaitsForTap, ...late };
}

async function assertLatePageAnswerIgnored({ page, fixture, releaseOldAnswer, autoScan, waitFor, tapCenter, st, secondRequestMs }) {
  // Keep the counter unchanged: recycled-canvas content owns identity even when
  // the viewer's counter lags behind its next composite.
  fixture.currentPage = 3;
  await page.evaluate(()=>window.__draw(3));
  // In manual mode, let the page-turn detection retire the loading page-2 frame
  // before requesting page 3. The provider answer remains pending throughout.
  if (!autoScan) await waitFor(async() => (await st()).frames === 0);
  await tapCenter();
  const turnMs = await waitFor(async()=> (await st()).texts.includes(PAGE_TEXT[2]));
  const beforeLateAnswer = await st();
  await page.evaluate(() => {
    window.__latePaints = [];
    window.__latePaintObserver = new MutationObserver(() => {
      window.__latePaints.push(...[...document.querySelectorAll('.jpdb-ocr-line')].map(line => line.dataset.ocrText));
    });
    window.__latePaintObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ocr-text'] });
  });
  releaseOldAnswer();
  await page.waitForTimeout(1600);
  const afterLateAnswer = await st();
  const latePaints = await page.evaluate(() => { window.__latePaintObserver.disconnect(); return window.__latePaints; });
  const lateAnswerIgnored = [turnMs >= 0, secondRequestMs >= 0,
    afterLateAnswer.texts.length === 1, afterLateAnswer.texts[0] === PAGE_TEXT[2],
    !latePaints.some(text => text === PAGE_TEXT[0] || text === PAGE_TEXT[1]),
    !afterLateAnswer.oldTargetsConnected].every(Boolean);
  return { turnMs, beforeLateAnswer, afterLateAnswer, latePaints, lateAnswerIgnored };
}

function passLabel(passed) {
  return passed ? 'PASS' : 'FAIL';
}

function reportPageTurnCase({ label, aMs, afterPage1, wordsOk, sceneB, afterScroll, scrollReOcr,
  turnOk, targetsRetired, manualWaitsForTap, lateAnswerIgnored, turnMs }) {
  console.log(`[${label}] A page1-OCR: ${aMs>=0?aMs+'ms':'NO OVERLAY'} (lines=${afterPage1.lines})`);
  console.log(`[${label}] C lookup targets: ${wordsOk ? 'OK' : 'NONE'} (targets=${afterPage1.hitTargets}, providerIds=${afterPage1.words})`);
  console.log(`[${label}] B scroll-survive(S1/S3): ${passLabel(sceneB)} (lines ${afterPage1.lines}->${afterScroll.lines}, reOCR=${scrollReOcr}, teardowns=${afterScroll.removals})`);
  console.log(`[${label}] D/E/F page turns: ${passLabel(turnOk)} (retired=${targetsRetired}, waitsForTap=${manualWaitsForTap}, lateAnswerIgnored=${lateAnswerIgnored}, newPage=${turnMs}ms)`);
}

const engines = (process.env.ENGINES||'chromium,firefox,webkit').split(',').filter(Boolean);
const results = [];
for (const e of engines) for (const readerMode of ['cty2', 'paged-counter']) for (const autoScan of [true, false]) { try { results.push(await run(e, autoScan, readerMode)); } catch(err){ console.log(`[${e}/${readerMode}/${autoScan ? 'auto' : 'manual'}] ERROR ${String(err).slice(0,200)}`); results.push({engineName:e,page1Ok:false,scrollSurvive:false,turnOk:false}); } }
console.log('\n==== SUMMARY ====');
let fails = 0;
for (const r of results) { const ok = r.page1Ok && r.wordsOk && r.scrollSurvive && r.turnOk; if(!ok) fails++; console.log(`${r.engineName}: page1=${r.page1Ok} words=${r.wordsOk} scrollSurvive=${r.scrollSurvive} realTurn=${r.turnOk} => ${ok?'OK':'FAIL'}`); }
console.log(fails ? `\nFAILURES: ${fails}` : '\nALL PASS — scroll keeps OCR; page turns retire old targets and reject late old-page answers.');
process.exit(fails?1:0);
