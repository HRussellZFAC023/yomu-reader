#!/usr/bin/env node
// Playwright smoke for the hosted PDF reader (docs/public/pdf-reader).
//
// It serves docs/public over loopback, then for three PDFs generated on the fly
// (text, text+image, image-only/scanned) it loads /pdf-reader/, uploads the
// file, and asserts: PDF.js paints a page canvas; text PDFs expose a selectable
// text layer; the scanned PDF is flagged with no usable text layer; the よむ
// runtime auto-loads and recognises the page (so popups/mining/furigana attach).
//
// No binary fixtures are committed — page.pdf() builds the PDFs in headless
// Chromium. Run: npm run smoke:pdf-reader

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const publicRoot = path.join(appRoot, 'docs', 'public');
const pdfReaderHtml = path.join(publicRoot, 'pdf-reader', 'index.html');
const userscript = path.join(publicRoot, 'yomu.user.js');
const css = path.join(publicRoot, 'yomu.css');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
    '.bcmap': 'application/octet-stream',
    '.pfb': 'application/octet-stream',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
};

function staticHandler(request, response) {
    try {
        const url = new URL(request.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith('/')) pathname += 'index.html';
        const filePath = path.join(publicRoot, pathname);
        if (!filePath.startsWith(publicRoot) || !existsSync(filePath)) {
            response.writeHead(404).end('not found');
            return;
        }
        serveFile(response, filePath, MIME[path.extname(filePath)] ?? 'application/octet-stream', request.method);
    } catch (error) {
        response.writeHead(500).end(String(error));
    }
}

const TEXT_PAGE_HTML = `<!doctype html><html lang="ja"><meta charset="utf-8">
<body style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;font-size:20px;line-height:2;padding:48px">
<h1>日本語のテスト文書</h1>
<p>今日は静かな喫茶店で新しい本を読みました。窓の外では雨が降っていました。</p>
<p>言葉の意味が分からないときは、単語をタップすると意味と読み方が表示されます。</p>
<p style="page-break-before:always">二ページ目です。漢字の勉強を続けましょう。毎日少しずつ読むことが大切です。</p>
</body></html>`;

async function bytesFromHtml(browser, html) {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    return pdf;
}

// A real raster (PNG) image embedded alongside Japanese text — proves the canvas
// path renders pictures, not just glyphs.
async function mixedPdfBytes(browser) {
    const page = await browser.newPage();
    const pngDataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 320, 200);
        gradient.addColorStop(0, '#cfe8d8');
        gradient.addColorStop(1, '#5ea780');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 320, 200);
        ctx.fillStyle = '#0b3d24';
        ctx.beginPath();
        ctx.arc(160, 100, 64, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '28px sans-serif';
        ctx.fillText('写真', 132, 110);
        return canvas.toDataURL('image/png');
    });
    await page.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8">
<body style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;font-size:20px;line-height:2;padding:48px">
<h1>図入りの文書</h1>
<p>次の画像は写真の例です。文章と画像が混ざったPDFでも読めます。</p>
<img alt="sample" width="320" height="200" src="${pngDataUrl}">
<p>画像の下にも日本語の説明があります。猫が庭で昼寝をしています。</p>
</body></html>`, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    return pdf;
}

async function imageOnlyPdfBytes(browser) {
    // Draw Japanese onto a canvas and embed it as a full-page image so the PDF
    // carries no selectable text layer — the scanned-document case.
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 400);
        ctx.fillStyle = '#111111';
        ctx.font = '40px sans-serif';
        ctx.fillText('これはスキャン画像です', 60, 180);
        ctx.fillText('文字は画像の一部です', 60, 260);
        return canvas.toDataURL('image/png');
    });
    await page.setContent(`<!doctype html><html><body style="margin:0"><img style="width:100%" src="${dataUrl}"></body></html>`, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    return pdf;
}

async function openInReader(browser, baseUrl, pdfBytes, fileName) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(`${baseUrl}/pdf-reader/`, { waitUntil: 'domcontentloaded' });
    await page.setInputFiles('[data-pdf-input]', { name: fileName, mimeType: 'application/pdf', buffer: pdfBytes });
    // Wait for PDF.js to paint the first page canvas.
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.pdf-page canvas');
        return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    }, { timeout: 15000 });
    return { page, consoleErrors };
}

async function readState(page) {
    // Give the runtime a moment to load + scan the freshly rendered text layer.
    await page.waitForTimeout(2500);
    return page.evaluate(() => ({
        hasPdf: document.querySelector('[data-app]')?.classList.contains('has-pdf') ?? false,
        canvasCount: document.querySelectorAll('.pdf-page canvas').length,
        renderedCanvas: [...document.querySelectorAll('.pdf-page canvas')].some(c => c.width > 0),
        textSpanCount: document.querySelectorAll('.textLayer span').length,
        textSample: (document.querySelector('.textLayer')?.textContent ?? '').replace(/\s+/g, '').slice(0, 40),
        scannedPages: document.querySelectorAll('.pdf-page.scanned').length,
        pageTotal: document.querySelector('[data-page-total]')?.textContent ?? '',
        runtimeLoaded: Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
        enhancedWords: document.querySelectorAll('.jpdb-reader-word, .textLayer ruby').length,
        statusText: document.querySelector('[data-status]')?.textContent ?? '',
    }));
}

async function run() {
    assertBuiltArtifacts([pdfReaderHtml, userscript, css], appRoot, 'Run npm run build && node scripts/sync-docs-userscript.cjs first.');

    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    const server = await startLoopbackServer(staticHandler, 'Could not bind PDF reader smoke server');
    const report = {};
    try {
        const textPdf = await bytesFromHtml(browser, TEXT_PAGE_HTML);
        const mixedPdf = await mixedPdfBytes(browser);
        const scannedPdf = await imageOnlyPdfBytes(browser);

        // --- 1) text PDF: canvas + selectable Japanese text layer + runtime ---
        {
            const { page, consoleErrors } = await openInReader(browser, server.origin, textPdf, 'text.pdf');
            const state = await readState(page);
            report.text = state;
            assert(state.hasPdf && state.renderedCanvas, 'text PDF should render a page canvas', state);
            assert(state.textSpanCount > 0 && /[぀-ヿ一-龯]/.test(state.textSample), 'text PDF should expose a Japanese text layer', state);
            assert(/\/\s*2\b/.test(state.pageTotal) || state.canvasCount >= 2, 'text PDF should report multiple pages', state);
            assert(state.runtimeLoaded, 'よむ runtime should auto-load on the PDF reader page', state);
            assert(!consoleErrors.some(e => /pdf\.min|worker|import/i.test(e)), 'no PDF.js load errors', { consoleErrors });
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-text.png') }).catch(() => {});
            await page.close();
        }

        // --- 2) text+image PDF: image embedded, text layer still present ---
        {
            const { page } = await openInReader(browser, server.origin, mixedPdf, 'mixed.pdf');
            const state = await readState(page);
            // Prove the embedded picture actually rasterised onto the canvas (the
            // green scene) rather than rendering as an empty/black box.
            const colorful = await page.evaluate(() => {
                const canvas = document.querySelector('.pdf-page canvas');
                const ctx = canvas.getContext('2d');
                const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let greenish = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
                    if (g > 90 && g > r && g > b) greenish += 1;
                }
                return greenish;
            });
            report.mixed = { ...state, greenishPixels: colorful };
            assert(state.renderedCanvas, 'mixed PDF should render a page canvas (image + text)', state);
            assert(state.textSpanCount > 0 && /[぀-ヿ一-龯]/.test(state.textSample), 'mixed PDF should expose a Japanese text layer', state);
            assert(colorful > 500, 'mixed PDF image should rasterise in colour (not a black box)', { greenishPixels: colorful });
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-mixed.png') }).catch(() => {});
            await page.close();
        }

        // --- 3) image-only/scanned PDF: canvas renders, flagged scanned, no text ---
        {
            const { page } = await openInReader(browser, server.origin, scannedPdf, 'scanned.pdf');
            const state = await readState(page);
            report.scanned = state;
            assert(state.renderedCanvas, 'scanned PDF should still render the page image', state);
            assert(state.textSpanCount === 0, 'scanned PDF should have no selectable text layer', state);
            assert(state.scannedPages > 0, 'scanned PDF should be flagged as scanned (OCR hint)', state);
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-scanned.png') }).catch(() => {});
            await page.close();
        }

        console.log(JSON.stringify(report, null, 2));
        console.log('\nPDF reader smoke passed.');
    } finally {
        await closeSmokeBrowserAndServer(browser, server);
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
