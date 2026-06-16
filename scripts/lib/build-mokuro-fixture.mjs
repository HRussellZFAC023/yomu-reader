#!/usr/bin/env node
// Build a faithful local mokuro reader page from REAL extracted images + REAL
// mokuro OCR JSON. Path contains "mokuro" so the file:// site-parser matches.
// Mirrors reader.mokuro.app DOM: #pagesContainer > .page > .pageContainer with
// an <img class="pageImage"> (manga page) + absolutely-positioned .textBox divs.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MOKURO_JSON = process.env.MOKURO_JSON || '/tmp/zombie.mokuro';
const IMG_DIR = process.env.MOKURO_IMG_DIR || '/tmp/zombie-extract';
const OUT_DIR = process.env.MOKURO_FIXTURE_DIR || '/tmp/mokuro-repro';
const PAGE_COUNT = Number(process.env.MOKURO_PAGES || 3);

const data = JSON.parse(readFileSync(MOKURO_JSON, 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderPage(page, idx, forceTopBlock) {
    const imgSrc = page.img_path; // e.g. -Zombie-Sagashitemasu-01/001.jpg
    const localImg = path.join(IMG_DIR, imgSrc);
    const destImg = path.join(OUT_DIR, `page${idx}.jpg`);
    if (existsSync(localImg)) copyFileSync(localImg, destImg);
    const W = page.img_width, H = page.img_height;
    const blocks = page.blocks.map((b, bi) => {
        let [x1, y1, x2, y2] = b.box;
        // Reproduce "no space above the text": pin the first block of page 1 to the very top edge.
        if (forceTopBlock && bi === 0) { const h = y2 - y1; y1 = 0; y2 = h; }
        const left = (100 * x1 / W).toFixed(3), top = (100 * y1 / H).toFixed(3);
        const w = (100 * (x2 - x1) / W).toFixed(3), h = (100 * (y2 - y1) / H).toFixed(3);
        const wm = b.vertical ? 'vertical-rl' : 'horizontal-tb';
        const fs = ((b.font_size || 24) / H * 100).toFixed(3);
        const lines = (b.lines || []).map(l => `<p>${esc(l)}</p>`).join('');
        return `<div class="textBox" style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;writing-mode:${wm};font-size:${fs}cqh">${lines}</div>`;
    }).join('\n      ');
    // Same-origin data: URL keeps the canvas un-tainted so OCR capture works in a
    // file:// smoke (a file:// <img src=…jpg> taints the canvas). Opt-in via env.
    let src = `page${idx}.jpg`;
    if (process.env.MOKURO_INLINE_IMAGES && existsSync(localImg)) {
        src = `data:image/jpeg;base64,${readFileSync(localImg).toString('base64')}`;
    }
    return `  <div class="page" id="page${idx}">
    <div class="pageContainer" style="aspect-ratio:${W}/${H}">
      <img class="pageImage" src="${src}" width="${W}" height="${H}" alt="page ${idx}">
      ${blocks}
    </div>
  </div>`;
}

const pages = data.pages.slice(0, PAGE_COUNT).map((p, i) => renderPage(p, i + 1, i === 0)).join('\n');

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mokuro reader (local repro) — ${esc(data.title)}</title>
<style>
  html,body { margin:0; background:#1a1a1a; }
  #pagesContainer { display:flex; flex-direction:column; align-items:center; }
  .page { width:100%; max-width:850px; }
  .pageContainer { position:relative; width:100%; container-type:size; background:#fff; }
  .pageImage { display:block; width:100%; height:auto; }
  /* mokuro default: textbox text hidden until hover, like the real reader */
  .textBox { position:absolute; line-height:1.1; font-family:"Noto Sans JP",sans-serif;
    color:rgba(0,0,0,0); white-space:nowrap; z-index:11; }
  .textBox p { margin:0; }
  .textBox:hover { color:rgba(0,0,0,1); background:rgba(255,255,255,.85); }
</style></head>
<body>
<div id="pagesContainer">
${pages}
</div>
</body></html>`;

const outFile = path.join(OUT_DIR, 'mokuro-reader.html');
writeFileSync(outFile, html);
console.log('wrote', outFile, `(${data.pages.slice(0, PAGE_COUNT).reduce((n, p) => n + p.blocks.length, 0)} textboxes, ${PAGE_COUNT} pages)`);
console.log('open: file://' + outFile);
