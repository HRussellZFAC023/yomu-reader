#!/usr/bin/env node
// Playwright smoke for the hosted PDF reader (docs/public/pdf-reader).
//
// It serves docs/public over loopback, then for PDFs generated on the fly
// (text, text+image, image-only/scanned, image-backed OCR text) it loads
// /pdf-reader/, uploads the file, and asserts: PDF.js paints a page canvas; text
// PDFs expose a selectable text layer; scanned PDFs are flagged away from dense
// inline page parsing; the よむ runtime auto-loads and OCRs scanned pages with
// readable in-place targets.
//
// No binary fixtures are committed — tiny PDF fixtures are built in memory with
// explicit ToUnicode maps so the text layer is deterministic on Linux runners.
// Run: npm run smoke:pdf-reader

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    gmRequestFetchBody,
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
const OCR_PAGE_ONE_TEXT = 'ページ一OCR本文';
const OCR_PAGE_TWO_TEXT = 'ページ二OCR本文';
const PDF_SMOKE_REQUEST_BRIDGE = '__yomuPdfSmokeRequest';
let ocrRequests = 0;
const ocrPayloads = [];
const queuedOcrTexts = [];

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
        const text = queuedOcrTexts.shift() ?? OCR_SMOKE_TEXT;
        ocrPayloads.push({ bytes: Buffer.byteLength(body, 'utf8'), text });
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
            width: 1000,
            height: 1400,
            lines: [{
                text,
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

function multiPageImageOnlyPdfBytes() {
    return buildPdfFixture([
        { lines: [], scannedGraphic: 1 },
        { lines: [], scannedGraphic: 2 },
    ]);
}

function imageBackedOcrPdfBytes() {
    return buildPdfFixture([{
        lines: [
            '画像の上に透明なOCR文字があります。',
            'このページはスキャンとして扱います。',
            '単語の色分けを重ねずにOCRで読みます。',
        ],
        scannedImage: true,
        invisibleText: true,
    }]);
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
        const imageRef = page.scannedImage ? addImageObject(addStream) : 0;
        const contentRef = addStream('', pageContentStream(page, glyphs));
        const resourceParts = [];
        if (fontRef) resourceParts.push(`/Font << /F1 ${fontRef} 0 R >>`);
        if (imageRef) resourceParts.push(`/XObject << /ImScan ${imageRef} 0 R >>`);
        const resources = `/Resources << ${resourceParts.join(' ')} >>`;
        return addObject(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 595 842] ${resources} /Contents ${contentRef} 0 R >>`);
    });

    setObject(catalogRef, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
    setObject(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
    return serializePdf(objects, catalogRef);
}

function addImageObject(addStream) {
    const width = 96;
    const height = 128;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 3;
            const paper = 235 + ((x + y) % 9);
            pixels[offset] = paper;
            pixels[offset + 1] = Math.max(0, paper - 8);
            pixels[offset + 2] = Math.max(0, paper - 18);
            if ((y > 18 && y < 24 && x > 14 && x < 82)
                || (y > 46 && y < 52 && x > 10 && x < 74)
                || (y > 74 && y < 80 && x > 18 && x < 88)) {
                pixels[offset] = 56;
                pixels[offset + 1] = 54;
                pixels[offset + 2] = 48;
            }
        }
    }
    const body = deflateSync(pixels).toString('latin1');
    return addStream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, body);
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
    if (page.scannedImage) {
        commands.push('q 451 0 0 650 72 96 cm /ImScan Do Q');
    }
    if (page.graphic) {
        commands.push(
            'q 0.82 0.93 0.86 rg 72 402 320 200 re f Q',
            'q 0.05 0.28 0.18 rg 190 466 88 88 re f Q',
        );
    }
    if (page.scannedGraphic) {
        const variant = typeof page.scannedGraphic === 'number' ? page.scannedGraphic : 1;
        const panel = variant === 2 ? '0.82 0.9 0.98' : '0.96 0.94 0.88';
        const panelBox = variant === 2 ? '48 188 499 430' : '72 500 451 210';
        const lineLeft = variant === 2 ? 154 : 108;
        const lineTop = variant === 2 ? 534 : 642;
        commands.push(
            `q ${panel} rg ${panelBox} re f Q`,
            `q 0.12 0.12 0.12 rg ${lineLeft} ${lineTop} ${variant === 2 ? 330 : 260} 22 re f Q`,
            `q 0.12 0.12 0.12 rg ${lineLeft} ${lineTop - 64} ${variant === 2 ? 250 : 318} 22 re f Q`,
            `q 0.12 0.12 0.12 rg ${lineLeft} ${lineTop - 128} ${variant === 2 ? 370 : 220} 22 re f Q`,
        );
    }
    if (page.lines.length) {
        commands.push('BT', '/F1 20 Tf');
        if (page.invisibleText) commands.push('3 Tr');
        commands.push('72 760 Td', '30 TL');
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
        learningTargetChosen: true,
        activeLanguageProfileId: 'pdf-smoke',
        languageProfiles: [{
            schemaVersion: 2,
            id: 'pdf-smoke',
            outputLanguage: 'en',
            learnerLanguage: 'en',
            targetLanguage: 'ja',
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        }],
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

function pdfSmokeSettingsForTarget(baseUrl, targetLanguage) {
    const settings = pdfSmokeSettings(baseUrl);
    return {
        ...settings,
        languageProfiles: settings.languageProfiles.map(profile => ({ ...profile, targetLanguage })),
    };
}

async function openInReader(browser, baseUrl, pdfBytes, fileName, settings = pdfSmokeSettings(baseUrl)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.exposeFunction(PDF_SMOKE_REQUEST_BRIDGE, async request => {
        const response = await fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: gmRequestFetchBody(request),
        });
        return {
            status: response.status,
            responseText: await response.text(),
            contentType: response.headers.get('content-type') ?? 'text/plain',
        };
    });
    await page.addInitScript(() => {
        for (const storageKey of Object.keys(localStorage)) {
            if (storageKey.startsWith('yomu-pdf-position:')) localStorage.removeItem(storageKey);
        }
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: PDF_SMOKE_REQUEST_BRIDGE,
    });
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
        const viewportCenterX = window.innerWidth / 2;
        const emptyCenterX = rect.left + rect.width / 2;
        const remainingCenterY = chromeRect.bottom + (window.innerHeight - chromeRect.bottom) / 2;
        const emptyCenterY = rect.top + rect.height / 2;
        return {
            visible: rect.width > 0 && rect.height > 0,
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            chromeBottom: Math.round(chromeRect.bottom),
            centerOffsetX: Math.round(emptyCenterX - viewportCenterX),
            centerOffsetY: Math.round(emptyCenterY - remainingCenterY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        };
    });
}

function assertEmptyLayout(layout, label) {
    assert(layout.visible, `${label} empty PDF drop area should be visible on first load`, layout);
    assert(layout.top >= layout.chromeBottom, `${label} empty PDF drop area should sit below the sticky chrome`, layout);
    assert(Math.abs(layout.centerOffsetX) <= 8, `${label} empty PDF drop area should be horizontally centered`, layout);
    assert(Math.abs(layout.centerOffsetY) <= 28, `${label} empty PDF drop area should be vertically centered in the remaining viewport`, layout);
    assert(layout.width >= Math.min(320, layout.viewportWidth - 32), `${label} empty PDF drop area should not collapse into a narrow strip`, layout);
    assert(layout.right <= layout.viewportWidth + 1 && layout.left >= -1, `${label} empty PDF drop area should fit inside the viewport`, layout);
}

async function readState(page) {
    // Give the runtime a moment to load + scan the freshly rendered text layer.
    await page.waitForTimeout(2500);
    return page.evaluate(() => {
        const ocrLineText = line => {
            const normalize = value => value.replace(/\s+/g, '');
            const semanticText = normalize(line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || '');
            const visualText = normalize([...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
                .filter(element => !element.closest('.jpdb-ocr-furi,.jpdb-reader-furi,rt,[data-jpdb-reader-surface-ignore="true"]'))
                .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
                .join(''));
            const fallbackText = normalize(line.textContent || '');
            return {
                semanticText: semanticText || visualText || fallbackText,
                visualText: visualText || semanticText || fallbackText,
            };
        };
        const ocrLines = [...document.querySelectorAll('.jpdb-ocr-line')];
        const ocrPageTextNodeCount = ocrLines.reduce((count, line) => {
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) count += 1;
            return count;
        }, 0);
        const visibleOcrLines = () => [...document.querySelectorAll('.jpdb-ocr-line')]
            .map(line => {
                const rect = line.getBoundingClientRect();
                const style = getComputedStyle(line);
                const word = line.querySelector('.jpdb-reader-word');
                const wordStyle = word ? getComputedStyle(word) : null;
                const furi = line.querySelector('.jpdb-ocr-furi,.jpdb-reader-furi,rt');
                const furiStyle = furi ? getComputedStyle(furi) : null;
                const text = ocrLineText(line);
                return {
                    text: text.semanticText,
                    visualText: text.visualText,
                    className: line.className,
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    backgroundColor: style.backgroundColor,
                    color: style.color,
                    textFillColor: style.webkitTextFillColor || '',
                    wordBackgroundImage: wordStyle?.backgroundImage || '',
                    wordBoxShadow: wordStyle?.boxShadow || '',
                    wordColor: wordStyle?.color || '',
                    wordTextDecorationColor: wordStyle?.textDecorationColor || '',
                    wordTextFillColor: wordStyle?.webkitTextFillColor || '',
                    furiOpacity: furiStyle?.opacity || '',
                    furiColor: furiStyle?.color || '',
                    furiTextFillColor: furiStyle?.webkitTextFillColor || '',
                    opacity: style.opacity,
                    display: style.display,
                    visibility: style.visibility,
                    inViewport: rect.width > 0
                        && rect.height > 0
                        && rect.bottom > 0
                        && rect.top < window.innerHeight
                        && rect.right > 0
                        && rect.left < window.innerWidth
                        && style.display !== 'none'
                        && style.visibility !== 'hidden'
                        && Number(style.opacity || '1') > 0,
                };
            })
            .filter(line => line.inViewport);
        const visibleLines = visibleOcrLines();
        return {
            hasPdf: document.querySelector('[data-app]')?.classList.contains('has-pdf') ?? false,
            canvasCount: document.querySelectorAll('.pdf-page canvas').length,
            renderedCanvas: [...document.querySelectorAll('.pdf-page canvas')].some(c => c.width > 0),
            textSpanCount: document.querySelectorAll('.textLayer span').length,
            textSample: (document.querySelector('.textLayer')?.textContent ?? '').replace(/\s+/g, '').slice(0, 40),
            textLayerEnhancedWords: document.querySelectorAll('.textLayer .jpdb-reader-word, .textLayer ruby').length,
            textPdfPages: document.querySelectorAll('.pdf-page.text-pdf').length,
            scannedPages: document.querySelectorAll('.pdf-page.scanned').length,
            ocrOffCanvases: document.querySelectorAll('.pdf-page canvas[data-yomu-canvas-ocr="off"]').length,
            ocrOnCanvases: document.querySelectorAll('.pdf-page canvas[data-yomu-canvas-ocr="on"]').length,
            ocrManualCanvases: document.querySelectorAll('.pdf-page canvas[data-yomu-canvas-ocr="manual"]').length,
            hiddenTextLayers: document.querySelectorAll('.textLayer[hidden], .textLayer[aria-hidden="true"]').length,
            firstPageMode: document.querySelector('.pdf-page')?.getAttribute('data-pdf-text') ?? '',
            firstPageTextReason: document.querySelector('.pdf-page')?.getAttribute('data-pdf-text-reason') ?? '',
            firstPageOcr: document.querySelector('.pdf-page')?.getAttribute('data-yomu-canvas-ocr') ?? '',
            ocrLineCount: ocrLines.length,
            scannerIsolatedOcrLineCount: ocrLines
                .filter(line => line.querySelector('.jpdb-ocr-line-text.jpdb-ocr-page-scanner-isolated')).length,
            ocrPageTextNodeCount,
            ocrTextSample: ocrLines
                .map(line => ocrLineText(line).semanticText)
                .join('')
                .slice(0, 40),
            ocrVisualTextSample: ocrLines
                .map(line => ocrLineText(line).visualText)
                .join('')
                .slice(0, 40),
            visibleOcrLineCount: visibleLines.length,
            visibleOcrTextSample: visibleLines.map(line => line.text).join('').slice(0, 40),
            visibleOcrVisualTextSample: visibleLines.map(line => line.visualText).join('').slice(0, 40),
            ocrLineVisuals: visibleLines.slice(0, 4),
            pageTotal: document.querySelector('[data-page-total]')?.textContent ?? '',
            runtimeLoaded: Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
            learningTargetLanguage: window.__yomuCompanions?.learningTargets?.activeLearningTargetLanguage?.() ?? '',
            enhancedWords: document.querySelectorAll('.jpdb-reader-word, .textLayer ruby').length,
            statusText: document.querySelector('[data-status]')?.textContent ?? '',
        };
    });
}

async function waitForOcrText(page, text, label, context = {}) {
    await page.waitForFunction(expected => [...document.querySelectorAll('.jpdb-ocr-line')]
        .some(line => (line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || '')
            .replace(/\s+/g, '')
            .includes(expected)), text, { timeout: 25000 })
        .catch(async error => {
            const state = await readState(page);
            throw new Error(`${label}: ${error.message}\n${JSON.stringify({ ocrRequests, ocrPayloads, state, context }, null, 2)}`);
        });
}

async function hoverFirstOcrLine(page) {
    const line = page.locator('.jpdb-ocr-line').first();
    const box = await line.boundingBox();
    assert(box && box.width > 10 && box.height > 10, 'OCR line should have a usable hover target', { box });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return page.evaluate(() => {
        const line = document.querySelector('.jpdb-ocr-line');
        const canvas = document.querySelector('.pdf-page canvas');
        const rect = line?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        const style = line ? getComputedStyle(line) : null;
        if (!line || !rect || !canvasRect || !style) return null;
        const semanticText = (line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || '').replace(/\s+/g, '');
        const visualText = [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
            .filter(element => !element.closest('.jpdb-ocr-furi,.jpdb-reader-furi,rt,[data-jpdb-reader-surface-ignore="true"]'))
            .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
            .join('')
            .replace(/\s+/g, '');
        return {
            text: semanticText || visualText || (line.textContent || '').replace(/\s+/g, ''),
            visualText: visualText || semanticText || (line.textContent || '').replace(/\s+/g, ''),
            color: style.color,
            backgroundColor: style.backgroundColor,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            pageAreaRatio: Number(((rect.width * rect.height) / Math.max(1, canvasRect.width * canvasRect.height)).toFixed(4)),
            intersectsCanvas: rect.right > canvasRect.left
                && rect.left < canvasRect.right
                && rect.bottom > canvasRect.top
                && rect.top < canvasRect.bottom,
        };
    });
}

async function visibleOcrText(page) {
    return page.evaluate(() => [...document.querySelectorAll('.jpdb-ocr-line')]
        .filter(line => {
            const rect = line.getBoundingClientRect();
            const style = getComputedStyle(line);
            return rect.width > 0
                && rect.height > 0
                && rect.bottom > 0
                && rect.top < window.innerHeight
                && rect.right > 0
                && rect.left < window.innerWidth
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || '1') > 0;
        })
        .map(line => {
            const generatedText = [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
                .filter(element => !element.closest('.jpdb-ocr-furi,.jpdb-reader-furi,rt,[data-jpdb-reader-surface-ignore="true"]'))
                .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
                .join('');
            return (generatedText || line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || line.textContent || '')
                .replace(/\s+/g, '');
        })
        .join(''));
}

async function visibleOcrLines(page) {
    return page.evaluate(() => [...document.querySelectorAll('.jpdb-ocr-line')]
        .map(line => {
            const rect = line.getBoundingClientRect();
            const style = getComputedStyle(line);
            const pages = [...document.querySelectorAll('.pdf-page')]
                .map(pageNode => ({ pageNode, rect: pageNode.getBoundingClientRect() }))
                .filter(page => page.rect.width > 0 && page.rect.height > 0);
            const page = pages
                .map(page => {
                    const left = Math.max(rect.left, page.rect.left);
                    const top = Math.max(rect.top, page.rect.top);
                    const right = Math.min(rect.right, page.rect.right);
                    const bottom = Math.min(rect.bottom, page.rect.bottom);
                    return {
                        number: page.pageNode.getAttribute('data-page-number') ?? '',
                        overlap: Math.max(0, right - left) * Math.max(0, bottom - top),
                    };
                })
                .sort((a, b) => b.overlap - a.overlap)[0];
            const semanticText = (line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || '').replace(/\s+/g, '');
            const visualText = [...line.querySelectorAll('[data-yomu-ocr-visual-text]')]
                .filter(element => !element.closest('.jpdb-ocr-furi,.jpdb-reader-furi,rt,[data-jpdb-reader-surface-ignore="true"]'))
                .map(element => element.getAttribute('data-yomu-ocr-visual-text') || '')
                .join('')
                .replace(/\s+/g, '');
            return {
                text: semanticText || visualText || (line.textContent || '').replace(/\s+/g, ''),
                visualText: visualText || semanticText || (line.textContent || '').replace(/\s+/g, ''),
                page: page?.overlap ? page.number : '',
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                inViewport: rect.width > 0
                    && rect.height > 0
                    && rect.bottom > 0
                    && rect.top < window.innerHeight
                    && rect.right > 0
                    && rect.left < window.innerWidth
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number(style.opacity || '1') > 0,
            };
        })
        .filter(line => line.inViewport));
}

async function readNavState(page) {
    return page.evaluate(() => ({
        pageInput: document.querySelector('[data-page-input]')?.value ?? '',
        pageTotal: document.querySelector('[data-page-total]')?.textContent ?? '',
        prevDisabled: document.querySelector('[data-prev-page]')?.disabled ?? null,
        nextDisabled: document.querySelector('[data-next-page]')?.disabled ?? null,
        pages: [...document.querySelectorAll('.pdf-page')].map(node => {
            const rect = node.getBoundingClientRect();
            return {
                page: node.getAttribute('data-page-number'),
                textMode: node.getAttribute('data-pdf-text'),
                ocr: node.getAttribute('data-yomu-canvas-ocr'),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                height: Math.round(rect.height),
            };
        }),
        scrollY: Math.round(window.scrollY),
    }));
}

async function waitForPageCanvas(page, pageNumber) {
    await page.waitForFunction(number => {
        const canvas = document.querySelector(`.pdf-page[data-page-number="${number}"] canvas`);
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return false;
        const rect = canvas.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
    }, pageNumber, { timeout: 15000 });
}

async function waitForScannedPageReady(page, pageNumber) {
    await page.waitForFunction(number => {
        const pageNode = document.querySelector(`.pdf-page[data-page-number="${number}"]`);
        const canvas = pageNode?.querySelector('canvas');
        return pageNode?.getAttribute('data-pdf-text') === 'scanned'
            && canvas?.getAttribute('data-yomu-canvas-ocr') === 'on';
    }, pageNumber, { timeout: 15000 });
}

async function verifyOfflineRuntimeGraph(browser, origin) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    try {
        await page.goto(`${origin}/pdf-reader/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
            () => Boolean(window.__yomuReaderAppInitialized && document.querySelector('script[data-yomu-hosted-pdf-companion]')),
            null,
            { timeout: 10_000 },
        );
        await page.evaluate(async () => { await navigator.serviceWorker.ready; });
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10_000 });

        await page.context().setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForFunction(
            () => Boolean(window.__yomuReaderAppInitialized && document.querySelector('script[data-yomu-hosted-pdf-companion]')),
            null,
            { timeout: 10_000 },
        );
        const offlineRuntime = await page.evaluate(() => ({
            controlled: Boolean(navigator.serviceWorker.controller),
            runtimeLoaded: Boolean(window.__yomuReaderAppInitialized),
            companion: document.querySelector('script[data-yomu-hosted-pdf-companion]')
                ?.getAttribute('data-yomu-hosted-pdf-companion') ?? '',
        }));
        assert(offlineRuntime.controlled && offlineRuntime.runtimeLoaded, 'PDF reader should boot its cached runtime graph offline', offlineRuntime);
        assert(/greasyfork\/yomu-runtime\.[a-f\d]{12}\.user\.js$/u.test(offlineRuntime.companion), 'PDF reader offline boot should use the immutable final-core companion path', offlineRuntime);
        return offlineRuntime;
    } finally {
        await page.context().setOffline(false).catch(() => {});
        await page.close();
    }
}

async function run() {
    assertBuiltArtifacts([pdfReaderHtml, userscript, css], appRoot, 'Run npm run build && node scripts/sync-docs-userscript.cjs first.');

    const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
    const server = await startLoopbackServer(staticHandler, 'Could not bind PDF reader smoke server');
    const report = {};
    try {
        Object.assign(report, await verifyEmptyLayouts(browser, server.origin));
        report.offlineRuntimeGraph = await verifyOfflineRuntimeGraph(browser, server.origin);

        const textPdf = textPdfBytes();
        report.learningTargetRuntime = await verifyLearningTargetRuntime(browser, server.origin, textPdf);
        report.text = await verifyTextPdf(browser, server.origin, textPdf);
        report.mixed = await verifyMixedPdf(browser, server.origin, mixedPdfBytes());
        Object.assign(report, await verifyScannedPdf(browser, server.origin, imageOnlyPdfBytes()));
        report.imageBackedOcr = await verifyImageBackedOcrPdf(browser, server.origin, imageBackedOcrPdfBytes());
        Object.assign(report, await verifyScannedPageChanges(browser, server.origin, multiPageImageOnlyPdfBytes()));

        console.log(JSON.stringify(report, null, 2));
        console.log('\nPDF reader smoke passed.');
    } finally {
        await closeSmokeBrowserAndServer(browser, server);
    }
}

async function verifyEmptyLayouts(browser, origin) {
    const layouts = {};
    for (const viewport of [
        { label: 'desktop', width: 1280, height: 1000 },
        { label: 'mobile', width: 390, height: 844 },
    ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.goto(`${origin}/pdf-reader/`, { waitUntil: 'domcontentloaded' });
        const emptyLayout = await readEmptyLayout(page);
        layouts[`empty-${viewport.label}`] = emptyLayout;
        assertEmptyLayout(emptyLayout, viewport.label);
        await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', `pdf-reader-empty-${viewport.label}.png`) }).catch(() => {});
        await page.close();
    }
    return layouts;
}

async function verifyLearningTargetRuntime(browser, origin, textPdf) {
    // This ephemeral loopback fixture is intentionally not a trusted
    // hosted-storage origin. Seed private shared settings and prove the split
    // runtime adopts them through its target singleton.
    const settings = pdfSmokeSettingsForTarget(origin, 'ko');
    const { page } = await openInReader(browser, origin, textPdf, 'target-runtime.pdf', settings);
    const state = await readState(page);
    assert(state.runtimeLoaded, 'split core and companions did not boot the よむ runtime', state);
    assert(state.learningTargetLanguage === 'ko', 'split core and companion target state diverged', state);
    await page.close();
    return {
        runtimeLoaded: state.runtimeLoaded,
        language: state.learningTargetLanguage,
    };
}

async function verifyTextPdf(browser, origin, textPdf) {
    const beforeOcr = ocrRequests;
    const { page, consoleErrors } = await openInReader(browser, origin, textPdf, 'text.pdf');
    const state = await readState(page);
    assert(state.hasPdf, 'text PDF should load', state);
    assert(state.renderedCanvas, 'text PDF should render a page canvas', state);
    assert(state.textSpanCount > 0, 'text PDF should expose a selectable text layer', state);
    assert(/[぀-ヿ一-龯]/.test(state.textSample), 'text PDF text layer should contain Japanese', state);
    assert(state.textPdfPages > 0, 'text PDF should be classified as text', state);
    assert(state.scannedPages === 0, 'text PDF should not be classified as scanned', state);
    assert(state.firstPageTextReason === 'text-layer', 'text PDF should keep its native text layer classification', state);
    assert(state.ocrOffCanvases > 0, 'text PDF canvases should disable raster OCR', state);
    assert(state.ocrOnCanvases === 0, 'text PDF canvases should not enable raster OCR', state);
    assert(ocrRequests === beforeOcr, 'text PDF should not call image OCR', { beforeOcr, ocrRequests, state });
    assert(pdfReportsMultiplePages(state), 'text PDF should report multiple pages', state);
    assert(state.runtimeLoaded, 'よむ runtime should auto-load on the PDF reader page', state);
    assert(!consoleErrors.some(error => /pdf\.min|worker|import/i.test(error)), 'no PDF.js load errors', { consoleErrors });
    await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-text.png') }).catch(() => {});
    await page.close();
    return state;
}

function pdfReportsMultiplePages(state) {
    return /\/\s*2\b/.test(state.pageTotal) || state.canvasCount >= 2;
}

async function verifyMixedPdf(browser, origin, mixedPdf) {
    const beforeOcr = ocrRequests;
    const { page } = await openInReader(browser, origin, mixedPdf, 'mixed.pdf');
    const state = await readState(page);
    const colorful = await countGreenishCanvasPixels(page);
    assert(state.renderedCanvas, 'mixed PDF should render a page canvas (image + text)', state);
    assert(state.textSpanCount > 0, 'mixed PDF should expose a selectable text layer', state);
    assert(/[぀-ヿ一-龯]/.test(state.textSample), 'mixed PDF text layer should contain Japanese', state);
    assert(state.textPdfPages > 0, 'mixed text/image PDF should use its text layer', state);
    assert(state.ocrOffCanvases > 0, 'mixed text/image PDF should keep canvas OCR disabled', state);
    assert(ocrRequests === beforeOcr, 'mixed text/image PDF should not call image OCR', { beforeOcr, ocrRequests, state });
    assert(colorful > 500, 'mixed PDF image should rasterise in colour (not a black box)', { greenishPixels: colorful });
    await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-mixed.png') }).catch(() => {});
    await page.close();
    return { ...state, greenishPixels: colorful };
}

async function countGreenishCanvasPixels(page) {
    return page.evaluate(() => {
        const canvas = document.querySelector('.pdf-page canvas');
        const ctx = canvas.getContext('2d');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let greenish = 0;
        for (let i = 0; i < data.length; i += 4) {
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            if (g > 90 && [r, b].every(channel => g > channel)) greenish += 1;
        }
        return greenish;
    });
}

async function verifyScannedPdf(browser, origin, scannedPdf) {
    const beforeOcr = ocrRequests;
    const { page } = await openInReader(browser, origin, scannedPdf, 'scanned.pdf');
    await waitForOcrText(page, OCR_SMOKE_TEXT, 'current scanned PDF page did not auto-OCR');
    const state = await readState(page);
    assertScannedPdfState(state, beforeOcr);
    const hoverVisual = await hoverFirstOcrLine(page);
    assertHoveredOcrLine(hoverVisual);
    await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-scanned.png') }).catch(() => {});
    await page.close();
    return { scanned: state, scannedHover: hoverVisual };
}

function assertScannedPdfState(state, beforeOcr) {
    assert(state.renderedCanvas, 'scanned PDF should still render the page image', state);
    assert(state.textSpanCount === 0, 'scanned PDF should have no selectable text layer', state);
    assert(state.scannedPages > 0, 'scanned PDF should be flagged as scanned (OCR hint)', state);
    assert(state.firstPageTextReason === 'empty-text-layer', 'image-only scanned PDF should be classified by its empty text layer', state);
    assert(state.ocrOnCanvases > 0, 'current scanned PDF canvas should opt into Yomu OCR', state);
    assert(state.ocrManualCanvases === 0, 'current scanned PDF canvas should not be manual-only OCR', state);
    assert(state.firstPageOcr === 'on', 'current scanned PDF page should mark OCR as enabled', state);
    assert(state.hiddenTextLayers > 0, 'scanned PDF should hide the empty text layer so OCR remains readable', state);
    assert(ocrRequests > beforeOcr, 'current scanned PDF should call the configured Yomu OCR endpoint', { beforeOcr, ocrRequests, ocrPayloads, state });
    assert(state.ocrLineCount > 0, 'scanned PDF should render OCR line targets', state);
    assert(state.ocrTextSample.includes(OCR_SMOKE_TEXT), 'scanned PDF should render OCR text for lookup', state);
    assert(state.ocrVisualTextSample.includes(OCR_SMOKE_TEXT), 'scanned PDF should reconstruct the recognized text from its generated page glyphs', state);
    assert(state.scannerIsolatedOcrLineCount === state.ocrLineCount, 'scanned PDF OCR should expose semantic line data', state);
    assert(state.ocrPageTextNodeCount === 0, 'scanned PDF OCR should withhold page Text nodes from external scanners', state);
    assert(state.ocrLineVisuals.every(hasReadableOcrBackground), 'scanned PDF OCR should paint readable in-place line targets', state);
    assert(state.ocrLineVisuals.every(hasReadableOcrText), 'scanned PDF OCR line text should be readable without hover/focus', state);
    assert(state.ocrLineVisuals.every(hasNeutralOcrWordPaint), 'scanned PDF OCR words should not leak reader colors or highlights over the page', state);
    assert(state.ocrLineVisuals.every(hasHiddenRestingFurigana), 'scanned PDF OCR furigana should stay hidden until hover/focus', state);
}

function hasReadableOcrBackground(line) {
    return line.backgroundColor !== 'rgba(0, 0, 0, 0)' && line.backgroundColor !== 'transparent';
}

function hasReadableOcrText(line) {
    return line.color !== 'rgba(0, 0, 0, 0)' && line.textFillColor !== 'rgba(0, 0, 0, 0)';
}

function hasNeutralOcrWordPaint(line) {
    return line.wordTextFillColor !== 'rgba(0, 0, 0, 0)'
        && line.wordBackgroundImage === 'none'
        && line.wordBoxShadow === 'none';
}

function hasHiddenRestingFurigana(line) {
    return line.furiOpacity === '' || line.furiOpacity === '0';
}

function assertHoveredOcrLine(hoverVisual) {
    assert(hoverVisual, 'scanned PDF should expose a hoverable OCR line');
    assert(hoverVisual.text.includes(OCR_SMOKE_TEXT), 'hovered scanned OCR line should expose the recognized text', hoverVisual);
    assert(hoverVisual.visualText.includes(OCR_SMOKE_TEXT), 'hovered scanned OCR line should retain the recognized generated glyphs', hoverVisual);
    assert(hoverVisual.intersectsCanvas, 'hovered scanned OCR line should intersect the page canvas', hoverVisual);
    assert(hoverVisual.width > 40, 'hovered scanned OCR line should have a useful width', hoverVisual);
    assert(hoverVisual.height > 10, 'hovered scanned OCR line should have a useful height', hoverVisual);
    assert(hoverVisual.pageAreaRatio < 0.06, 'hovered scanned OCR line should stay compact, not cover the page with a large block', hoverVisual);
}

async function verifyImageBackedOcrPdf(browser, origin, imageBackedOcrPdf) {
    const beforeOcr = ocrRequests;
    const { page } = await openInReader(browser, origin, imageBackedOcrPdf, 'image-backed-ocr.pdf');
    await waitForOcrText(page, OCR_SMOKE_TEXT, 'image-backed OCR PDF did not auto-OCR');
    const state = await readState(page);
    assertImageBackedOcrState(state, beforeOcr);
    await waitForHiddenTextLayerToSettle(page);
    await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-image-backed-ocr.png') }).catch(() => {});
    await page.close();
    return state;
}

function assertImageBackedOcrState(state, beforeOcr) {
    assert(state.renderedCanvas, 'image-backed OCR PDF should render the page image', state);
    assert(state.textSpanCount > 0, 'image-backed OCR PDF should expose its embedded OCR text layer before hiding it', state);
    assert(/透明なOCR文字/.test(state.textSample), 'image-backed OCR PDF should preserve its embedded OCR text sample', state);
    assert(state.scannedPages > 0, 'image-backed OCR PDF should be classified as scanned', state);
    assert(state.textPdfPages === 0, 'image-backed OCR PDF should not be classified as text', state);
    assert(state.firstPageTextReason === 'image-backed-invisible-text', 'image-backed OCR PDF should be classified by its invisible text over a raster page', state);
    assert(state.hiddenTextLayers > 0, 'image-backed OCR PDF should hide the embedded OCR text layer', state);
    assert(state.ocrOnCanvases > 0, 'image-backed OCR PDF canvas should opt into Yomu OCR', state);
    assert(state.ocrOffCanvases === 0, 'image-backed OCR PDF canvas should not opt out of Yomu OCR', state);
    assert(ocrRequests > beforeOcr, 'image-backed OCR PDF should call the configured Yomu OCR endpoint', { beforeOcr, ocrRequests, ocrPayloads, state });
    assert(state.visibleOcrLineCount > 0, 'image-backed OCR PDF should render visible OCR line targets', state);
    assert(state.visibleOcrTextSample.includes(OCR_SMOKE_TEXT), 'image-backed OCR PDF should render readable OCR line text', state);
    assert(state.visibleOcrVisualTextSample.includes(OCR_SMOKE_TEXT), 'image-backed OCR PDF should reconstruct the recognized text from its visible generated glyphs', state);
    assert(state.scannerIsolatedOcrLineCount === state.ocrLineCount, 'image-backed OCR targets should keep semantic line data', state);
    assert(state.ocrPageTextNodeCount === 0, 'image-backed OCR targets should withhold page Text nodes from external scanners', state);
    assert(state.ocrLineVisuals.every(hasNeutralImageBackedWordPaint), 'image-backed OCR PDF should suppress word-level OCR highlights', state);
}

function hasNeutralImageBackedWordPaint(line) {
    return line.wordBackgroundImage === 'none' && line.wordBoxShadow === 'none';
}

async function waitForHiddenTextLayerToSettle(page) {
    // The scanner can transiently touch the layer before classification. The
    // invariant is that enhanced words never settle there.
    await page.waitForFunction(() => [...document.querySelectorAll('.textLayer')]
        .every(layer => layer.querySelectorAll('.jpdb-reader-word, ruby').length === 0), undefined, { timeout: 10_000 })
        .catch(async () => {
            assert(false, 'image-backed OCR PDF should not render dense reader words/ruby into the hidden text layer', await readState(page));
        });
}

async function verifyScannedPageChanges(browser, origin, scannedTwoPagePdf) {
    queuedOcrTexts.length = 0;
    queuedOcrTexts.push(OCR_PAGE_ONE_TEXT, OCR_PAGE_TWO_TEXT);
    const beforeOcr = ocrRequests;
    const { page } = await openInReader(browser, origin, scannedTwoPagePdf, 'scanned-two-page.pdf');
    const scannedPageOne = await verifyFirstScannedPage(page);
    const scannedPageTurn = await turnToSecondScannedPage(page);
    const scannedPageTwo = await verifySecondScannedPage(page, beforeOcr);
    const scannedZoom = await verifyScannedPageZoom(page, beforeOcr);
    await page.screenshot({ path: path.join(appRoot, 'qa-artifacts', 'pdf-reader-scanned-page-change.png') }).catch(() => {});
    await page.close();
    return { scannedPageOne, scannedPageTurn, scannedPageTwo, scannedZoom };
}

async function verifyFirstScannedPage(page) {
    await waitForPageCanvas(page, 1);
    await waitForScannedPageReady(page, 1);
    await waitForOcrText(page, OCR_PAGE_ONE_TEXT, 'page 1 scanned PDF OCR did not render');
    const state = await readState(page);
    const pageOneVisibleLines = await visibleOcrLines(page);
    assert(state.ocrTextSample.includes(OCR_PAGE_ONE_TEXT), 'page 1 scanned OCR should show the page 1 result', state);
    assert(state.ocrPageTextNodeCount === 0, 'page 1 scanned OCR should remain scanner-isolated while preserving its generated glyphs', state);
    assert(pageOneVisibleLines.some(isPageOneOcrLine), 'page 1 OCR line should be visibly anchored to page 1 before navigation', { pageOneVisibleLines, pageOneState: state });
    return { ...state, pageOneVisibleLines };
}

function isPageOneOcrLine(line) {
    return line.page === '1' && line.text.includes(OCR_PAGE_ONE_TEXT) && line.visualText.includes(OCR_PAGE_ONE_TEXT);
}

async function turnToSecondScannedPage(page) {
    const pageTurnStart = Date.now();
    await page.waitForFunction(() => !document.querySelector('[data-next-page]')?.disabled, undefined, { timeout: 8000 })
        .catch(async error => {
            throw new Error(`next page button did not become enabled: ${error.message}\n${JSON.stringify(await readNavState(page), null, 2)}`);
        });
    await page.click('[data-next-page]');
    await page.waitForFunction(() => document.querySelector('[data-page-input]')?.value === '2', undefined, { timeout: 8000 });
    await page.waitForFunction(() => {
        const rect = document.querySelector('.pdf-page[data-page-number="2"]')?.getBoundingClientRect();
        return rect && rect.top >= 0 && rect.top <= 180;
    }, undefined, { timeout: 8000 });
    await waitForPageCanvas(page, 2);
    await waitForScannedPageReady(page, 2);
    const pageTurnMs = Date.now() - pageTurnStart;
    await waitForFirstPageOcrToClear(page);
    const staleVisibleText = await visibleOcrText(page);
    const staleVisibleLines = await visibleOcrLines(page);
    assert(pageTurnMs < 8000, 'changing scanned PDF pages should stay responsive', { pageTurnMs });
    assert(staleVisibleLines.every(line => line.page === '2'), 'visible OCR after page navigation should be anchored to the newly visible PDF page', { staleVisibleLines, nav: await readNavState(page) });
    return { pageTurnMs, staleVisibleText, staleVisibleLines };
}

async function waitForFirstPageOcrToClear(page) {
    // Page 1's overlay tears down asynchronously after navigation. Stale text
    // must never settle over page 2.
    await page.waitForFunction(pageOneText => {
        return [...document.querySelectorAll('.jpdb-ocr-line')].every(lineIsCleared);

        function lineIsCleared(line) {
            const semanticText = semanticLineText(line);
            if (!semanticText.includes(pageOneText)) return true;
            return lineHasNoVisibleArea(line) || lineIsHidden(line);
        }

        function semanticLineText(line) {
            return String(line.getAttribute('data-ocr-text') || line.getAttribute('aria-label') || '')
                .replace(/\s+/g, '');
        }

        function lineHasNoVisibleArea(line) {
            const rect = line.getBoundingClientRect();
            return [rect.width <= 0, rect.height <= 0, rect.bottom <= 0, rect.top >= window.innerHeight].some(Boolean);
        }

        function lineIsHidden(line) {
            const style = getComputedStyle(line);
            const opacity = Number(style.opacity || '1');
            return [style.display === 'none', style.visibility === 'hidden', opacity <= 0].some(Boolean);
        }
    }, OCR_PAGE_ONE_TEXT.replace(/\s+/g, ''), { timeout: 10_000 })
        .catch(async () => {
            assert(false, 'page 1 OCR text should not remain visibly over page 2', {
                staleVisibleText: await visibleOcrText(page),
                staleVisibleLines: await visibleOcrLines(page),
                nav: await readNavState(page),
            });
        });
}

async function verifySecondScannedPage(page, beforeOcr) {
    await waitForOcrText(page, OCR_PAGE_TWO_TEXT, 'page 2 scanned PDF OCR did not render');
    const pageTwoVisibleText = await visibleOcrText(page);
    const pageTwoVisibleLines = await visibleOcrLines(page);
    const state = await readState(page);
    assert(ocrPayloads.some(payload => payload.text === OCR_PAGE_TWO_TEXT), 'page 2 scanned OCR should make its own OCR request before or during the page change', { beforeOcr, ocrRequests, ocrPayloads, pageTwoState: state });
    assert(pageTwoVisibleText.includes(OCR_PAGE_TWO_TEXT), 'page 2 OCR should be visible after the new scan', { pageTwoVisibleText, pageTwoState: state });
    assert(!pageTwoVisibleText.includes(OCR_PAGE_ONE_TEXT), 'page 2 should not show stale page 1 OCR after rescanning', { pageTwoVisibleText, pageTwoState: state });
    assert(state.ocrPageTextNodeCount === 0, 'page 2 scanned OCR should remain scanner-isolated while preserving its generated glyphs', state);
    assert(pageTwoVisibleLines.some(isPageTwoOcrLine), 'page 2 OCR line should be visibly anchored to page 2 after navigation', { pageTwoVisibleLines, pageTwoState: state });
    return { ...state, pageTwoVisibleText, pageTwoVisibleLines };
}

function isPageTwoOcrLine(line) {
    return line.page === '2' && line.text.includes(OCR_PAGE_TWO_TEXT) && line.visualText.includes(OCR_PAGE_TWO_TEXT);
}

async function verifyScannedPageZoom(page, beforeOcr) {
    const pageTwoBox = await page.locator('.pdf-page[data-page-number="2"]').evaluate(element => Math.round(element.getBoundingClientRect().width));
    const zoomStart = Date.now();
    await page.click('[data-zoom-in]');
    await page.waitForFunction(width => {
        const pageNode = document.querySelector('.pdf-page[data-page-number="2"]');
        const canvas = pageNode?.querySelector('canvas');
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return false;
        return Math.abs(pageNode.getBoundingClientRect().width - width) > 8;
    }, pageTwoBox, { timeout: 8000 });
    const zoomMs = Date.now() - zoomStart;
    assert(zoomMs < 8000, 'zooming a scanned PDF page should stay responsive', { zoomMs });
    assert(ocrRequests >= beforeOcr + 2, 'scanned page-change flow should have exercised both OCR requests', { beforeOcr, ocrRequests, ocrPayloads });
    return { zoomMs };
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
