#!/usr/bin/env node
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
import { chromium, webkit, firefox } from 'playwright';
import path from 'node:path';
import zlib from 'node:zlib';
import { createSmokePaths, addGmStorageBridgeInitScript, YOMU_SETTINGS_KEY } from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, dist: DIST } = createSmokePaths(import.meta.dirname);
const COMPANIONS = ['yomu-anki', 'yomu-kanji-study', 'yomu-settings-surface', 'yomu-video', 'yomu-ocr-manga'].map(n => path.join(DIST, 'greasyfork', `${n}.user.js`));
const BRIDGE = '__yomuCty2Req';
const IMG_URL = 'https://c.bookwalker.jp/scrambled/cty2-p1.png';
const IMG_URL_2 = 'https://c.bookwalker.jp/scrambled/cty2-p2.png';

const CRC = (() => { const t = new Int32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;} return t; })();
const crc32 = b => { let c=~0; for (let i=0;i<b.length;i++) c=CRC[(c^b[i])&0xff]^(c>>>8); return ~c>>>0; };
const chunk = (t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const cc=Buffer.alloc(4);cc.writeUInt32BE(crc32(td));return Buffer.concat([l,td,cc]);};
function makePng(w=400,h=560,inv=false){const raw=Buffer.alloc((w*4+1)*h);let o=0;for(let y=0;y<h;y++){raw[o++]=0;for(let x=0;x<w;x++){let v=((x%40<22)&&(y%50<30))?0:((x+y)%3===0?96:255);if(inv)v=255-v;raw[o++]=v;raw[o++]=v;raw[o++]=v;raw[o++]=255;}}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
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
  const browser = await engine.launch({ headless:true });
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

  await context.close(); await browser.close();

  console.log(`[${engineName}] A page1-OCR: ${aMs>=0?aMs+'ms':'NO OVERLAY'} (lines=${afterPage1.lines})`);
  console.log(`[${engineName}] C words(S2): ${wordsOk?'OK':'NONE'} (words=${afterPage1.words})`);
  console.log(`[${engineName}] B scroll-survive(S1/S3): ${sceneB?'PASS':'FAIL'} (lines ${afterPage1.lines}->${afterScroll.lines}, reOCR=${scrollReOcr}, teardowns=${afterScroll.removals})`);
  console.log(`[${engineName}] D real-turn re-OCR: ${turnOk?'PASS '+turnMs+'ms':'FAIL (new page not OCRd)'}`);
  return { engineName, page1Ok:aMs>=0, wordsOk, scrollSurvive:sceneB, turnOk };
}

const engines = (process.env.ENGINES||'chromium,firefox,webkit').split(',').filter(Boolean);
const results = [];
for (const e of engines) { try { results.push(await run(e)); } catch(err){ console.log(`[${e}] ERROR ${String(err).slice(0,200)}`); results.push({engineName:e,page1Ok:false,scrollSurvive:false,turnOk:false}); } }
console.log('\n==== SUMMARY ====');
let fails = 0;
for (const r of results) { const ok = r.page1Ok && r.scrollSurvive && r.turnOk; if(!ok) fails++; console.log(`${r.engineName}: page1=${r.page1Ok} words=${r.wordsOk} scrollSurvive=${r.scrollSurvive} realTurn=${r.turnOk} => ${ok?'OK':'FAIL'}`); }
console.log(fails ? `\nFAILURES: ${fails}` : '\nALL PASS — cty=2 within-page scroll keeps the OCR overlay; real turns still re-OCR.');
process.exit(fails?1:0);
