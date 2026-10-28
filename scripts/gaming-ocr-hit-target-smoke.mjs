#!/usr/bin/env node
// Deterministic geometry proof: expected hit boxes come from ORIGINAL provider pixels,
// never the replacement font or the rendered element being tested. No visible fixture UI.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { css, bundle } = buildFixtureAssets();
const browser = await chromium.launch();
let cells = 0, points = 0;
try {
    for (const deviceScaleFactor of [1, 1.25, 1.5, 2]) {
        for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 900 }]) {
            const context = await browser.newContext({ viewport, deviceScaleFactor });
            const page = await context.newPage();
            await page.setContent(`<style>${css}</style><body class="yomu-gaming-overlay-document"><main class="overlay-shell" data-capture-mode="instant"></main><script>${bundle}</script>`);
            for (const readings of [false, true]) {
                const result = await page.evaluate(measureProviderTargets, { readings });
                if (result.failures.length) throw new Error(`dpr ${deviceScaleFactor} ${viewport.width}x${viewport.height} readings=${readings}: ${JSON.stringify(result.failures)}`);
                cells += 1; points += result.points;
            }
            await context.close();
        }
    }
} finally { await browser.close(); }
console.log(`[gaming-hit-target] ${cells} scale/viewport cells, ${points} ORIGINAL provider edge/center points hit their words; no duplicate glyph or background paint.`);

function measureProviderTargets({ readings }) {
    const api = window.YomuGamingOverlay;
    // The running Reader preserves generated source content for measurement even when
    // its fill is transparent. Reproduce that post-enrichment cascade, not empty glyphs.
    if (!document.querySelector('#source-glyph-measurement')) {
        const style = document.createElement('style'); style.id = 'source-glyph-measurement';
        style.textContent = 'body.yomu-gaming-overlay-document .overlay-inline-layer .jpdb-ocr-visual-text[data-yomu-ocr-visual-text]::before{content:attr(data-yomu-ocr-visual-text)!important}';
        document.head.append(style);
    }
    const sourceWidth = 960, sourceHeight = 540;
    const scale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
    const frame = { imageLeft: (innerWidth - sourceWidth * scale) / 2, imageTop: (innerHeight - sourceHeight * scale) / 2,
        imageWidth: sourceWidth * scale, imageHeight: sourceHeight * scale };
    const rows = [
        { text: '冒険を始めよう', vertical: false, box: {left: 120, top: 360, width: 176, height: 28}, words: [
            {text: '冒険', box: {left:120, top:360, width:20, height:28}},
            {text: 'を', box: {left:147, top:360, width:18, height:28}},
            {text: '始めよう', box: {left:204, top:360, width:92, height:28}},
        ] },
        { text: '日本語', vertical: true, box: {left: 820, top: 90, width: 28, height: 99}, words: [
            {text: '日本', box: {left:820, top:90, width:28, height:60}},
            {text: '語', box: {left:820, top:159, width:28, height:30}},
        ] },
        // Line-only local/cloud providers must retain usable, explicitly approximate targets.
        { text: '冒険へ', vertical: false, box: {left: 0, top: 0, width: 120, height: 30}, parts: ['冒険', 'へ'], expected: [
            {left:0, top:0, width:80, height:30}, {left:80, top:0, width:40, height:30},
        ] },
    ];
    const normalized = box => ({left:box.left/sourceWidth, top:box.top/sourceHeight, width:box.width/sourceWidth, height:box.height/sourceHeight});
    const root = document.querySelector('main');
    root.innerHTML = api.overlayNormalizedOcrLayerHtml(rows.map(row => ({ ...row, box: normalized(row.box),
        words: row.words?.map(word => ({...word, box:normalized(word.box)})) })));
    const failures = []; let points = 0;
    [...root.querySelectorAll('[data-ocr-line]')].forEach((line, index) => {
        const row = rows[index], text = line.querySelector('.jpdb-ocr-line-text');
        text.innerHTML = (row.parts ?? row.words.map(word => word.text)).map((part, wordIndex) =>
            `<span class="jpdb-reader-word jpdb-reader-scan-word${readings ? ' jpdb-reader-has-furi' : ''}" data-hit-word="${index}:${wordIndex}">${readings ? `<ruby><span class="jpdb-reader-ruby-base">${part}</span><rt>ことば</rt></ruby>` : part}</span>`).join('');
        api.normalizeOcrRenderedText(text, true);
    });
    api.layoutOverlayOcrLines(root, frame);
    if (readings) root.querySelectorAll('[data-ocr-line]').forEach(line => line.classList.add('jpdb-ocr-line-active'));
    if (readings && root.querySelectorAll('.jpdb-ocr-furi').length === 0) failures.push({missingReadings:true});
    [...root.querySelectorAll('[data-ocr-line]')].forEach((line, rowIndex) => {
        [...line.querySelectorAll('[data-hit-word]')].forEach((word, wordIndex) => {
            const expected = rows[rowIndex].expected?.[wordIndex] ?? rows[rowIndex].words[wordIndex].box;
            const rect = word.getBoundingClientRect();
            if (readings && [...word.querySelectorAll('*')].some(node => getComputedStyle(node).pointerEvents !== 'none'))
                failures.push({interactiveEnrichment:word.dataset.hitWord});
            const x = frame.imageLeft + expected.left * scale, y = frame.imageTop + expected.top * scale;
            const width = expected.width * scale, height = expected.height * scale;
            if (Math.max(Math.abs(rect.left-x),Math.abs(rect.top-y),Math.abs(rect.width-width),Math.abs(rect.height-height)) > 2)
                failures.push({word:word.dataset.hitWord, expected:{x,y,width,height},actual:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
            for (const dx of [0.15,0.5,0.85]) for (const dy of [0.15,0.5,0.85]) {
                points++;
                const hit = document.elementFromPoint(x + dx * width, y + dy * height);
                if (hit !== word && !word.contains(hit)) failures.push({word:word.dataset.hitWord,miss:{dx,dy},hit:hit?.className});
            }
        });
    });
    for (const node of root.querySelectorAll('.overlay-inline-layer, .overlay-inline-layer *')) {
        const style = getComputedStyle(node), clear = value => value === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(value);
        if (!clear(style.webkitTextFillColor) || !clear(style.backgroundColor) || style.backgroundImage !== 'none'
            || style.textShadow !== 'none' || ['::before','::after'].some(pseudo => { const p=getComputedStyle(node,pseudo); return !['none','normal'].includes(p.content) && (!clear(p.webkitTextFillColor) || !clear(p.backgroundColor) || p.backgroundImage !== 'none' || p.textShadow !== 'none'); }))
            failures.push({paintLeak:node.className});
    }
    return { points, failures };
}

function buildFixtureAssets() {
    const workspace = mkdtempSync(path.join(tmpdir(), 'yomu-gaming-hit-target-'));
    try {
        const cssOut = path.join(workspace, 'yomu.css');
        execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reader-css.mjs')], {
            env: { ...process.env, YOMU_READER_CSS_OUT: cssOut, YOMU_NEW_TAB_CSS_OUT: path.join(workspace, 'newtab.css') },
            stdio: 'pipe',
        });
        const styles = readFileSync(cssOut, 'utf8')
            + '\n' + readFileSync(path.join(ROOT, 'src', 'gaming', 'renderer', 'styles.css'), 'utf8');
        const entry = path.join(workspace, 'entry.ts');
        const out = path.join(workspace, 'bundle.js');
        const source = relative => path.join(ROOT, 'src', ...relative.split('/')).replaceAll('\\', '/');
        writeFileSync(entry, [
            `export { overlayNormalizedOcrLayerHtml, layoutOverlayOcrLines } from '${source('gaming/renderer/ocr-lines')}';`,
            `export { normalizeOcrRenderedText } from '${source('reader/ocr/rendered-text')}';`,
        ].join('\n'));
        buildSync({
            absWorkingDir: ROOT,
            entryPoints: [entry],
            bundle: true,
            format: 'iife',
            globalName: 'YomuGamingOverlay',
            platform: 'browser',
            outfile: out,
            logLevel: 'silent',
        });
        return { css: styles, bundle: readFileSync(out, 'utf8') };
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
}
