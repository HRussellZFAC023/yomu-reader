#!/usr/bin/env node
// Playwright smoke for the hosted PDF reader (docs/public/pdf-reader).
//
// It serves docs/public over loopback, then for three PDFs generated on the fly
// (text, text+image, image-only/scanned) it loads /pdf-reader/, uploads the
// file, and asserts: PDF.js paints a page canvas; text PDFs expose a selectable
// text layer; the scanned PDF is flagged with no usable text layer; the よむ
// runtime auto-loads and recognises the page (so popups/mining/furigana attach).
//
// No binary fixtures are committed — tiny PDF fixtures are built in memory with
// explicit ToUnicode maps so the text layer is deterministic on Linux runners.
// Run: npm run smoke:pdf-reader

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
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const publicRoot = path.join(appRoot, 'docs', 'public');
const pdfReaderHtml = path.join(publicRoot, 'pdf-reader', 'index.html');
const userscript = path.join(publicRoot, 'yomu.user.js');
const css = path.join(publicRoot, 'yomu.css');
const OCR_SMOKE_TEXT = 'スキャンOCR本文';
let ocrRequests = 0;
const ocrPayloads = [];

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
        if (pathname === '/ocr-smoke') {
            serveMockOcr(request, response);
            return;
        }
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

function serveMockOcr(request, response) {
    if (request.method !== 'POST') {
        response.writeHead(405).end('method not allowed');
        return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
        body += chunk;
    });
    request.on('end', () => {
        ocrRequests += 1;
        ocrPayloads.push({ bytes: Buffer.byteLength(body, 'utf8') });
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
            width: 1000,
            height: 1400,
            lines: [{
                text: OCR_SMOKE_TEXT,
                box: { left: 120, top: 180, width: 360, height: 72 },
            }],
        }));
    });
}

const TEXT_PAGES = [
    [
        '日本語のテスト文書',
        '今日は静かな喫茶店で新しい本を読みました。',
        '窓の外では雨が降っていました。',
        '言葉の意味が分からないときは、単語をタップすると意味と読み方が表示されます。',
    ],
    [
        '二ページ目です。',
        '漢字の勉強を続けましょう。',
        '毎日少しずつ読むことが大切です。',
    ],
];

const MIXED_PAGE = [
    '図入りの文書',
    '次の画像は写真の例です。',
    '文章と画像が混ざったPDFでも読めます。',
    '画像の下にも日本語の説明があります。',
    '猫が庭で昼寝をしています。',
];

function textPdfBytes() {
    return buildPdfFixture(TEXT_PAGES.map(lines => ({ lines })));
}

function mixedPdfBytes() {
    return buildPdfFixture([{ lines: MIXED_PAGE, graphic: true }]);
}

function imageOnlyPdfBytes() {
    return buildPdfFixture([{ lines: [], scannedGraphic: true }]);
}

function buildPdfFixture(pages) {
    const glyphs = collectGlyphs(pages);
    const objects = [];
    const addObject = content => {
        objects.push(content);
        return objects.length;
    };
    const setObject = (ref, content) => {
        objects[ref - 1] = content;
    };
    const addStream = (dict, body) => addObject(`<< ${dict} /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`);

    const catalogRef = addObject('');
    const pagesRef = addObject('');
    const fontRef = glyphs.size ? addFontObjects(addObject, addStream, glyphs) : 0;
    const pageRefs = pages.map(page => {
        const contentRef = addStream('', pageContentStream(page, glyphs));
        const resources = fontRef ? `/Resources << /Font << /F1 ${fontRef} 0 R >> >>` : '/Resources << >>';
        return addObject(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 595 842] ${resources} /Contents ${contentRef} 0 R >>`);
    });

    setObject(catalogRef, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
    setObject(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
    return serializePdf(objects, catalogRef);
}

function collectGlyphs(pages) {
    const glyphs = new Map();
    let nextCid = 1;
    for (const page of pages) {
        for (const line of page.lines) {
            for (const char of Array.from(line)) {
                if (!glyphs.has(char)) {
                    glyphs.set(char, nextCid);
                    nextCid += 1;
                }
            }
        }
    }
    return glyphs;
}

function addFontObjects(addObject, addStream, glyphs) {
    const toUnicodeRef = addStream('', toUnicodeCMap(glyphs));
    const descriptorRef = addObject('<< /Type /FontDescriptor /FontName /YomuSmokeSans /Flags 4 /FontBBox [0 -220 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');
    const cidFontRef = addObject(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /YomuSmokeSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor ${descriptorRef} 0 R /DW 1000 >>`);
    return addObject(`<< /Type /Font /Subtype /Type0 /BaseFont /YomuSmokeSans /Encoding /Identity-H /DescendantFonts [${cidFontRef} 0 R] /ToUnicode ${toUnicodeRef} 0 R >>`);
}

function pageContentStream(page, glyphs) {
    const commands = ['q 1 1 1 rg 0 0 595 842 re f Q'];
    if (page.graphic) {
        commands.push(
            'q 0.82 0.93 0.86 rg 72 402 320 200 re f Q',
            'q 0.05 0.28 0.18 rg 190 466 88 88 re f Q',
        );
    }
    if (page.scannedGraphic) {
        commands.push(
            'q 0.96 0.94 0.88 rg 72 500 451 210 re f Q',
            'q 0.12 0.12 0.12 rg 108 642 260 18 re f Q',
            'q 0.12 0.12 0.12 rg 108 594 318 18 re f Q',
            'q 0.12 0.12 0.12 rg 108 546 220 18 re f Q',
        );
    }
    if (page.lines.length) {
        commands.push('BT', '/F1 20 Tf', '72 760 Td', '30 TL');
        page.lines.forEach((line, index) => {
            if (index) commands.push('T*');
            commands.push(`<${encodedGlyphLine(line, glyphs)}> Tj`);
        });
        commands.push('ET');
    }
    return commands.join('\n');
}

function encodedGlyphLine(line, glyphs) {
    return Array.from(line)
        .map(char => cidHex(glyphs.get(char) ?? 0))
        .join('');
}

function toUnicodeCMap(glyphs) {
    const entries = Array.from(glyphs.entries()).map(([char, cid]) => `<${cidHex(cid)}> <${unicodeHex(char)}>`);
    const chunks = [];
    for (let index = 0; index < entries.length; index += 100) chunks.push(entries.slice(index, index + 100));
    return [
        '/CIDInit /ProcSet findresource begin',
        '12 dict begin',
        'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /YomuSmokeUnicode def',
        '/CMapType 2 def',
        '1 begincodespacerange',
        '<0000> <FFFF>',
        'endcodespacerange',
        ...chunks.flatMap(chunk => [`${chunk.length} beginbfchar`, ...chunk, 'endbfchar']),
        'endcmap',
        'CMapName currentdict /CMap defineresource pop',
        'end',
        'end',
    ].join('\n');
}

function cidHex(cid) {
    return cid.toString(16).toUpperCase().padStart(4, '0');
}

function unicodeHex(char) {
    return Array.from(char)
        .map(unit => unit.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
        .join('');
}

function serializePdf(objects, rootRef) {
    const chunks = [Buffer.from('%PDF-1.7\n', 'latin1')];
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
        offsets.push(byteLength(chunks));
        chunks.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, 'latin1'));
    }
    const xrefOffset = byteLength(chunks);
    const rows = offsets.map((offset, index) => index === 0
        ? '0000000000 65535 f '
        : `${String(offset).padStart(10, '0')} 00000 n `);
    chunks.push(Buffer.from([
        `xref\n0 ${objects.length + 1}`,
        ...rows,
        `trailer\n<< /Size ${objects.length + 1} /Root ${rootRef} 0 R >>`,
        'startxref',
        String(xrefOffset),
        '%%EOF',
        '',
    ].join('\n'), 'latin1'));
    return Buffer.concat(chunks);
}

function byteLength(chunks) {
    return chunks.reduce((total, chunk) => total + chunk.length, 0);
}

function pdfSmokeSettings(baseUrl) {
    return {
        onboardingSeen: true,
        ocrEnabled: true,
        ocrAutoScanImages: true,
        ocrShowTextOverlay: true,
        ocrProvider: 'local-service',
        ocrEndpointUrl: `${baseUrl}/ocr-smoke`,
        ocrMinImageArea: 1,
        ocrMaxImagesPerPage: 8,
        ocrMaxImagePixels: 640000,
        lookupOnHover: false,
        showFloatingButton: false,
        enableLogging: false,
    };
}

async function openInReader(browser, baseUrl, pdfBytes, fileName, settings = pdfSmokeSettings(baseUrl)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: YOMU_SETTINGS_KEY, value: settings });
    await page.goto(`${baseUrl}/pdf-reader/`, { waitUntil: 'domcontentloaded' });
    await page.setInputFiles('[data-pdf-input]', { name: fileName, mimeType: 'application/pdf', buffer: pdfBytes });
    // Wait for PDF.js to paint the first page canvas.
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.pdf-page canvas');
        return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    }, { timeout: 15000 });
    return { page, consoleErrors };
}

async function readEmptyLayout(page) {
    return page.evaluate(() => {
        const empty = document.querySelector('.empty');
        const chrome = document.querySelector('.chrome');
        const rect = empty?.getBoundingClientRect();
        const chromeRect = chrome?.getBoundingClientRect();
        if (!rect || !chromeRect) return { visible: false };
        const remainingCenterY = chromeRect.bottom + (window.innerHeight - chromeRect.bottom) / 2;
        const emptyCenterY = rect.top + rect.height / 2;
        return {
            visible: rect.width > 0 && rect.height > 0,
            top: Math.round(rect.top),
            chromeBottom: Math.round(chromeRect.bottom),
            centerOffsetY: Math.round(emptyCenterY - remainingCenterY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
        };
    });
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
        textPdfPages: document.querySelectorAll('.pdf-page.text-pdf').length,
        scannedPages: document.querySelectorAll('.pdf-page.scanned').length,
        ocrOffCanvases: document.querySelectorAll('.pdf-page canvas[data-yomu-canvas-ocr="off"]').length,
        ocrOnCanvases: document.querySelectorAll('.pdf-page canvas[data-yomu-canvas-ocr="on"]').length,
        hiddenTextLayers: document.querySelectorAll('.textLayer[hidden], .textLayer[aria-hidden="true"]').length,
        firstPageMode: document.querySelector('.pdf-page')?.getAttribute('data-pdf-text') ?? '',
        firstPageOcr: document.querySelector('.pdf-page')?.getAttribute('data-yomu-canvas-ocr') ?? '',
        ocrLineCount: document.querySelectorAll('.jpdb-ocr-line').length,
        ocrTextSample: [...document.querySelectorAll('.jpdb-ocr-line')]
            .map(line => line.textContent?.replace(/\s+/g, '') ?? '')
            .join('')
            .slice(0, 40),
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
        {
            const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
            await page.goto(`${server.origin}/pdf-reader/`, { waitUntil: 'domcontentloaded' });
            const emptyLayout = await readEmptyLayout(page);
            report.empty = emptyLayout;
            assert(emptyLayout.visible, 'empty PDF drop area should be visible on first load', emptyLayout);
            assert(emptyLayout.top >= emptyLayout.chromeBottom, 'empty PDF drop area should sit below the sticky chrome', emptyLayout);
            assert(Math.abs(emptyLayout.centerOffsetY) <= 24, 'empty PDF drop area should be centered in the remaining viewport', emptyLayout);
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-empty.png') }).catch(() => {});
            await page.close();
        }

        const textPdf = textPdfBytes();
        const mixedPdf = mixedPdfBytes();
        const scannedPdf = imageOnlyPdfBytes();

        // --- 1) text PDF: canvas + selectable Japanese text layer + runtime ---
        {
            const beforeOcr = ocrRequests;
            const { page, consoleErrors } = await openInReader(browser, server.origin, textPdf, 'text.pdf');
            const state = await readState(page);
            report.text = state;
            assert(state.hasPdf && state.renderedCanvas, 'text PDF should render a page canvas', state);
            assert(state.textSpanCount > 0 && /[぀-ヿ一-龯]/.test(state.textSample), 'text PDF should expose a Japanese text layer', state);
            assert(state.textPdfPages > 0 && state.scannedPages === 0, 'text PDF should be classified as text, not scanned', state);
            assert(state.ocrOffCanvases > 0 && state.ocrOnCanvases === 0, 'text PDF canvases should keep raster OCR disabled', state);
            assert(ocrRequests === beforeOcr, 'text PDF should not call image OCR', { beforeOcr, ocrRequests, state });
            assert(/\/\s*2\b/.test(state.pageTotal) || state.canvasCount >= 2, 'text PDF should report multiple pages', state);
            assert(state.runtimeLoaded, 'よむ runtime should auto-load on the PDF reader page', state);
            assert(!consoleErrors.some(e => /pdf\.min|worker|import/i.test(e)), 'no PDF.js load errors', { consoleErrors });
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-text.png') }).catch(() => {});
            await page.close();
        }

        // --- 2) text+graphic PDF: painted content plus a text layer ---
        {
            const beforeOcr = ocrRequests;
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
            assert(state.textPdfPages > 0 && state.ocrOffCanvases > 0, 'mixed text/image PDFs should use the text layer and keep canvas OCR disabled', state);
            assert(ocrRequests === beforeOcr, 'mixed text/image PDF should not call image OCR', { beforeOcr, ocrRequests, state });
            assert(colorful > 500, 'mixed PDF image should rasterise in colour (not a black box)', { greenishPixels: colorful });
            await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-mixed.png') }).catch(() => {});
            await page.close();
        }

        // --- 3) image-only/scanned PDF: canvas renders, flagged scanned, no text ---
        {
            const beforeOcr = ocrRequests;
            const { page } = await openInReader(browser, server.origin, scannedPdf, 'scanned.pdf');
            await page.waitForFunction(text => [...document.querySelectorAll('.jpdb-ocr-line')]
                .some(line => line.textContent?.includes(text)), OCR_SMOKE_TEXT, { timeout: 15000 })
                .catch(async error => {
                    const state = await readState(page);
                    throw new Error(`scanned PDF OCR overlay did not appear: ${error.message}\n${JSON.stringify({ beforeOcr, ocrRequests, ocrPayloads, state }, null, 2)}`);
                });
            const state = await readState(page);
            report.scanned = state;
            assert(state.renderedCanvas, 'scanned PDF should still render the page image', state);
            assert(state.textSpanCount === 0, 'scanned PDF should have no selectable text layer', state);
            assert(state.scannedPages > 0, 'scanned PDF should be flagged as scanned (OCR hint)', state);
            assert(state.ocrOnCanvases > 0 && state.firstPageOcr === 'on', 'scanned PDF canvases should opt into Yomu raster OCR', state);
            assert(state.hiddenTextLayers > 0, 'scanned PDF should hide the empty text layer so OCR remains readable', state);
            assert(ocrRequests > beforeOcr, 'scanned PDF should call the configured Yomu OCR endpoint', { beforeOcr, ocrRequests, ocrPayloads });
            assert(state.ocrLineCount > 0 && state.ocrTextSample.includes(OCR_SMOKE_TEXT), 'scanned PDF should render the OCR overlay text', state);
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
