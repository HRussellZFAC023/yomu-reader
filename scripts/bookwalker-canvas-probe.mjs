#!/usr/bin/env node
// Live BookWalker viewer probe: injects the real built userscript (document-start)
// with a GM storage + GM_xmlhttpRequest->node-fetch bridge (so real Google Lens
// OCR works), navigates the live viewer, and dumps a full canvas + OCR-overlay
// diagnostic. Used to root-cause and then verify yomu working on bookwalker.jp.
//
//   node scripts/bookwalker-canvas-probe.mjs "<viewer url>"
//
// Env: YOMU_HEADED=1 (headed chrome), YOMU_PROFILE=/path (persistent signed-in
// profile clone), YOMU_WAIT_MS=20000 (settle time before probing).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';
import { createYomuPaths } from './lib/paths.mjs';
import { addGmStorageBridgeInitScript, gmRequestFetchBody } from './lib/smoke-harness.mjs';

const require = createRequire(import.meta.url);
const { GREASY_FORK_LIBRARIES, greasyForkLibraryPath } = require('./lib/greasyfork-libraries.cjs');
const { appRoot: ROOT, qaArtifactsRoot: ARTIFACTS } = createYomuPaths(import.meta.dirname);
const DIST = path.join(ROOT, 'dist');
const USERSCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const CSS_PATH = path.join(DIST, 'yomu.css');
const COMPANION_SCRIPT_PATHS = GREASY_FORK_LIBRARIES.map(library => path.join(DIST, greasyForkLibraryPath(library.fileName)));
const SETTINGS_KEY = 'jpdb-popup-reader-settings';

const URL_ARG = process.argv[2] || 'https://viewer.bookwalker.jp/03/30/viewer.html?cid=aabe2acf-1006-41b5-8bbf-eed7ca343c61&cty=1';
const PROFILE = process.env.YOMU_PROFILE || '';
const HEADED = process.env.YOMU_HEADED === '1' || Boolean(PROFILE);
const WAIT_MS = Number(process.env.YOMU_WAIT_MS) || 22000;
const [VW, VH] = (process.env.YOMU_VIEWPORT || '1280x1600').split('x').map(Number);
const VIEWPORT = { width: VW || 1280, height: VH || 1600 };
const BROWSER = process.env.YOMU_BROWSER || 'chromium'; // chromium | firefox | webkit
const CONSOLE_DIAG = process.env.YOMU_CONSOLE_DIAG === '1';
const ENGINES = { chromium, firefox, webkit };

const SETTINGS = {
    onboardingSeen: true,
    apiKey: '',
    interfaceLanguage: 'en',
    ocrEnabled: true,
    ocrAutoScanImages: true,
    ocrProvider: 'google-lens',
    ocrShowTextOverlay: true,
    ocrMaxImagesPerPage: 6,
    jpdbDefinitionsEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    ankiEnabled: false,
    enableLogging: true,
    showFloatingButton: true,
};

// Self-contained: runs inside page.evaluate. Inventories every canvas + the
// userscript's OCR frames/overlays and whether the reader runtime booted.
function probeDom() {
    const blankRatio = canvas => {
        try {
            const s = document.createElement('canvas');
            s.width = 24; s.height = 24;
            const ctx = s.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(canvas, 0, 0, 24, 24);
            const { data } = ctx.getImageData(0, 0, 24, 24);
            let min = 255, max = 0, opaque = 0;
            const buckets = new Set();
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 8) continue;
                opaque++;
                const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
                if (lum < min) min = lum;
                if (lum > max) max = lum;
                buckets.add(lum >> 4);
            }
            return { contrast: max - min, buckets: buckets.size, opaqueFrac: +(opaque / (data.length / 4)).toFixed(2) };
        } catch (e) { return { error: String(e && e.message || e) }; }
    };
    const canvases = [...document.querySelectorAll('canvas')].map((c, i) => {
        const r = c.getBoundingClientRect();
        let toDataUrlOk = false;
        try { c.toDataURL('image/jpeg', 0.5); toDataUrlOk = true; } catch { toDataUrlOk = false; }
        return {
            i,
            w: c.width, h: c.height,
            css: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) },
            cls: c.className || '',
            id: c.id || '',
            parentId: c.parentElement?.id || '',
            parentCls: c.parentElement?.className || '',
            toDataUrlOk,
            content: blankRatio(c),
        };
    });
    return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        readerBooted: Boolean(document.querySelector('[data-jpdb-reader-root]'))
            || document.documentElement.className.includes('jpdb-reader'),
        runtimeOwner: document.querySelector('#jpdb-reader-runtime-owner')?.getAttribute('data-yomu-runtime-owner') || null,
        canvasCount: canvases.length,
        canvases,
        pageCounter: document.querySelector('#pageSliderCounter')?.textContent?.trim() || null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        // Screen-layout inventory: every NFBR screen/viewport container, its class,
        // and how many page-shaped (>=600) canvases it holds — reveals single vs
        // double-page-spread structure and which container is .currentScreen.
        screens: [...document.querySelectorAll('[id^="viewport"], [id$="Screen"], #renderer')].map(el => {
            const r = el.getBoundingClientRect();
            const pageCanvases = [...el.querySelectorAll('canvas')].filter(c => c.width >= 600 && c.height >= 600);
            return {
                id: el.id, cls: el.className,
                currentScreen: el.classList.contains('currentScreen'),
                rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) },
                pageCanvasCount: pageCanvases.length,
            };
        }),
        // Mirror of the shipped fix: page-shaped canvases the .currentScreen filter
        // selects (anchored to the #viewport container), vs total page canvases.
        totalPageCanvases: [...document.querySelectorAll('canvas')].filter(c => c.width >= 600 && c.height >= 600).length,
        fixSelectedCanvases: (() => {
            const page = [...document.querySelectorAll('canvas')].filter(c => c.width >= 600 && c.height >= 600);
            if (page.length < 2) return page.length;
            const onScreen = page.filter(c => {
                const vp = c.closest('[id^="viewport"]');
                return vp ? vp.classList.contains('currentScreen') : Boolean(c.closest('.currentScreen'));
            });
            return onScreen.length || page.length;
        })(),
        iframes: [...document.querySelectorAll('iframe')].map(f => ({ src: f.src, w: f.clientWidth, h: f.clientHeight })),
        ocrCanvasFrames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
        ocrBackgroundFrames: document.querySelectorAll('.jpdb-ocr-background-frame').length,
        ocrLines: document.querySelectorAll('.jpdb-ocr-line').length,
        readerWords: document.querySelectorAll('.jpdb-reader-word').length,
        ocrOverlays: document.querySelectorAll('.jpdb-ocr-overlay, [class*="jpdb-ocr"]').length,
        bodyTextSample: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
        frames: [...document.querySelectorAll('.jpdb-ocr-canvas-frame')].map(f => {
            const r = f.getBoundingClientRect();
            const cs = getComputedStyle(f);
            return {
                srcLen: (f.getAttribute('src') || '').length,
                rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) },
                naturalW: f.naturalWidth, naturalH: f.naturalHeight, complete: f.complete,
                display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex, position: cs.position,
            };
        }),
        ocrEls: [...document.querySelectorAll('[class*="jpdb-ocr"]')].slice(0, 12).map(e => ({
            cls: e.className, tag: e.tagName, hidden: e.hidden,
            lineCount: e.querySelectorAll('.jpdb-ocr-line').length,
            wordCount: e.querySelectorAll('.jpdb-reader-word').length,
            text: (e.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
            html: e.outerHTML.slice(0, 240),
        })),
    };
}

function installConsoleDiag() {
    if (window.__yomuBwConsoleDiagInstalled) return;
    window.__yomuBwConsoleDiagInstalled = true;
    let ticks = 0;
    const sampleCanvas = canvas => {
        const rect = canvas.getBoundingClientRect();
        let readable = false;
        try {
            const scratch = document.createElement('canvas');
            scratch.width = 4;
            scratch.height = 4;
            const ctx = scratch.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(canvas, 0, 0, 4, 4);
            ctx.getImageData(0, 0, 1, 1);
            readable = true;
        } catch {
            readable = false;
        }
        return {
            w: canvas.width,
            h: canvas.height,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            cssW: Math.round(rect.width),
            cssH: Math.round(rect.height),
            viewport: canvas.closest('[id^="viewport"]')?.id || '',
            current: Boolean(canvas.closest('.currentScreen')),
            readable,
        };
    };
    const sample = () => {
        const ocrWords = [...document.querySelectorAll('.jpdb-ocr-layer .jpdb-reader-word')];
        const payload = {
            tick: ticks++,
            href: location.href,
            readyState: document.readyState,
            pageCounter: document.querySelector('#pageSliderCounter')?.textContent?.trim() || '',
            frames: document.querySelectorAll('.jpdb-ocr-canvas-frame').length,
            layers: document.querySelectorAll('.jpdb-ocr-layer').length,
            lines: document.querySelectorAll('.jpdb-ocr-line').length,
            words: ocrWords.length,
            firstText: (ocrWords[0]?.textContent || '').trim().slice(0, 40),
            statusCards: [...document.querySelectorAll('[class*="jpdb-ocr-video-frame-status"]')].map(el => ({
                cls: el.className,
                status: el.dataset.status || '',
                hidden: el.hidden,
            })),
            canvases: [...document.querySelectorAll('canvas')]
                .filter(canvas => canvas.width >= 600 && canvas.height >= 600)
                .slice(0, 4)
                .map(sampleCanvas),
        };
        console.log('[yomu-bw-console-diag]', JSON.stringify(payload));
        if (ticks >= 90) clearInterval(timer);
    };
    const timer = setInterval(sample, 1000);
    sample();
}

async function main() {
    mkdirSync(ARTIFACTS, { recursive: true });
    const userscript = readFileSync(USERSCRIPT_PATH, 'utf8');
    const css = readFileSync(CSS_PATH, 'utf8');
    const companions = COMPANION_SCRIPT_PATHS.map(p => readFileSync(p, 'utf8'));

    const engine = ENGINES[BROWSER] || chromium;
    // channel:'chrome' + chromium flags are chromium-only; firefox/webkit use the
    // bundled build. Persistent (signed) profile is only wired for chromium.
    const launchOpts = BROWSER === 'chromium'
        ? { headless: !HEADED, channel: 'chrome', args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] }
        : { headless: !HEADED };
    const bridgeLog = [];
    let browser = null;
    let context;
    console.log(`[probe] engine=${BROWSER} viewport=${VIEWPORT.width}x${VIEWPORT.height}`);
    if (PROFILE && BROWSER === 'chromium') {
        context = await chromium.launchPersistentContext(PROFILE, { ...launchOpts, bypassCSP: true, viewport: VIEWPORT });
    } else {
        browser = await engine.launch(launchOpts);
        context = await browser.newContext({ bypassCSP: true, viewport: VIEWPORT });
    }

    // GM_xmlhttpRequest -> real node fetch (so live Google Lens OCR works).
    await context.exposeFunction('__yomuBwBridge', async request => {
        try {
            const res = await fetch(request.url, {
                method: request.method || 'GET',
                headers: request.headers || {},
                body: gmRequestFetchBody(request),
            });
            const buf = Buffer.from(await res.arrayBuffer());
            bridgeLog.push({ url: request.url.slice(0, 120), status: res.status, type: res.headers.get('content-type') || '', bytes: buf.length });
            return { status: res.status, bytes: [...buf], contentType: res.headers.get('content-type') || '', responseText: buf.toString('utf8') };
        } catch (e) {
            bridgeLog.push({ url: request.url.slice(0, 120), error: String(e && e.message || e) });
            return { status: 0, bytes: [], contentType: '', responseText: '' };
        }
    });
    // Inject GM bridge + companions + main userscript at document-start (context-level
    // so it applies to the page we navigate), like a real userscript.
    await addGmStorageBridgeInitScript(context, { key: SETTINGS_KEY, value: SETTINGS, css, requestBridgeName: '__yomuBwBridge' });
    if (CONSOLE_DIAG) {
        await context.addInitScript({ content: `(${installConsoleDiag.toString()})();` });
    }
    for (const lib of companions) await context.addInitScript({ content: lib });
    await context.addInitScript({ content: userscript });

    let page = (PROFILE && context.pages()[0]) ? context.pages()[0] : await context.newPage();
    const consoleMsgs = [];
    const consoleDiag = [];
    const attachListeners = p => {
        p.on('console', m => {
            const t = m.text();
            if (t.startsWith('[yomu-bw-console-diag]')) {
                try {
                    consoleDiag.push(JSON.parse(t.slice('[yomu-bw-console-diag]'.length).trim()));
                } catch {
                    consoleDiag.push({ parseError: t.slice(0, 400) });
                }
            }
            if (['error', 'warning'].includes(m.type()) || /ocr|lens|recogni|canvas/i.test(t)) consoleMsgs.push(`${m.type()}: ${t}`.slice(0, 400));
        });
        p.on('pageerror', e => consoleMsgs.push(`pageerror: ${String(e).slice(0, 300)}`));
    };
    attachListeners(page);

    console.log(`[probe] navigating ${URL_ARG} (headed=${HEADED}, profile=${PROFILE || 'none'})`);
    try {
        await page.goto(URL_ARG, { waitUntil: 'commit', timeout: 45000 });
    } catch (e) {
        console.log('[probe] goto warning:', String(e).split('\n')[0]);
    }

    // If we landed on a BookWalker product/store page (not viewer.html), open the
    // full viewer via its free "試し読み" control so we get a real viewer session
    // (deep-linking viewer.html for a purchased book 401s; the product flow doesn't).
    const isViewer = u => /viewer(-trial)?\.bookwalker\.jp\/.*viewer\.html/.test(u || '');
    if (!isViewer(page.url())) {
        await page.waitForTimeout(4000);
        const popupPromise = context.waitForEvent('page', { timeout: 25000 }).catch(() => null);
        const clicked = await page.evaluate(() => {
            const re = /(試し読み|ためし|立ち読み|無料で読む|無料で試す|今すぐ読む|read|trial)/i;
            const els = [...document.querySelectorAll('a, button, [role="button"]')];
            const hit = els.find(e => re.test((e.textContent || '').trim()) || /viewer/i.test(e.getAttribute?.('href') || ''))
                || els.find(e => /viewer-trial|viewer\.bookwalker/i.test(e.getAttribute?.('href') || ''));
            if (!hit) return null;
            hit.scrollIntoView({ block: 'center' });
            hit.click();
            return ((hit.textContent || '').trim() || hit.getAttribute('href') || '').slice(0, 80);
        }).catch(() => null);
        console.log('[probe] product page; clicked trial control:', clicked);
        const popup = await popupPromise;
        if (popup) {
            page = popup;
            attachListeners(page);
            await page.waitForLoadState('commit').catch(() => {});
            console.log('[probe] switched to viewer tab:', page.url());
        } else {
            await page.waitForTimeout(3000);
            console.log('[probe] no popup; current url:', page.url());
        }
    }
    // page.evaluate has no built-in timeout; a frozen/again page context (seen in
    // headless Firefox on this viewer) hangs it forever. Race every poll evaluate.
    const evalSafe = (fn, fb, ms = 8000) => Promise.race([
        page.evaluate(fn).catch(() => fb),
        new Promise(resolve => setTimeout(() => resolve(fb), ms)),
    ]);

    // Optionally advance pages (RTL manga: Left = next) to reach a 2-page story
    // spread, so we can verify the on-screen canvas captures both pages.
    const advance = Number(process.env.YOMU_ADVANCE) || 0;
    if (advance > 0) {
        // Wait for the viewer to be interactive first.
        const vdl = Date.now() + 20000;
        while (Date.now() < vdl) {
            const ok = await evalSafe(() => Boolean(document.querySelector("#pageSliderCounter")), false);
            if (ok) break;
            await page.waitForTimeout(1000);
        }
        for (let n = 0; n < advance; n++) {
            await page.keyboard.press('ArrowLeft').catch(() => {});
            await page.waitForTimeout(1400);
        }
        console.log(`[probe] advanced ${advance} pages; counter now`, await page.evaluate(() => document.querySelector('#pageSliderCounter')?.textContent?.trim() || '?').catch(() => '?'));
    }
    // Poll for the viewer to paint a page canvas, then settle so the reader can
    // poll a few cycles + OCR. Never block forever.
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
        const ready = await evalSafe(() => document.querySelectorAll("canvas").length > 0 || Boolean(document.querySelector("#pageSliderCounter")), false);
        if (ready) break;
        await page.waitForTimeout(1000);
    }
    // Wait until OCR words actually render into the overlay (deterministic), not a
    // fixed sleep — the viewer's boot buffer-swaps make first-render time variable.
    let firstWordMs = -1;
    const statusSamples = [];
    const renderStart = Date.now();
    const sawWord = await page.waitForSelector('.jpdb-ocr-layer .jpdb-reader-word', { timeout: WAIT_MS + 25000 })
        .then(() => true)
        .catch(() => false);
    if (sawWord) firstWordMs = Date.now() - renderStart;
    // Let enrichment/positioning settle once words exist.
    await page.waitForTimeout(3000);

    const report = await evalSafe(probeDom, { error: 'probeDom evaluate timed out' }, 12000);

    // End-to-end interaction test: click an OCR'd word and confirm the popover opens.
    report.interaction = { attempted: false };
    try {
        if (firstWordMs >= 0) {
            const word = page.locator('.jpdb-ocr-layer .jpdb-reader-word').first();
            report.interaction.attempted = true;
            report.interaction.wordText = (await word.textContent())?.trim().slice(0, 40) || '';
            const popSel = '.jpdb-reader-popover, [class*="popover" i]';
            let shown = false;
            for (let attempt = 0; attempt < 2 && !shown; attempt++) {
                await word.click({ force: true, timeout: 8000 }).catch(() => {});
                shown = await page.waitForSelector(popSel, { timeout: 6000 }).then(() => true).catch(() => false);
            }
            report.interaction = {
                ...report.interaction,
                ...await page.evaluate(() => {
                    const pop = document.querySelector('.jpdb-reader-popover, [class*="popover" i]');
                    return {
                        popoverShown: Boolean(pop),
                        popoverText: (pop?.textContent || '').replace(/\s+/g, ' ').slice(0, 200),
                    };
                }),
            };
            await page.screenshot({ path: path.join(ARTIFACTS, 'bookwalker-probe-popover.png'), timeout: 15000 }).catch(() => {});
        }
    } catch (e) {
        report.interaction.error = String(e).split('\n')[0];
    }
    report.firstWordMs = firstWordMs;
    report.statusSamples = statusSamples.slice(0, 24);
    report.consoleDiag = consoleDiag.slice(-24);
    report.sawSpinner = statusSamples.some(s => s.cards.some(c => /loading/.test(c.cls) && !c.hidden && c.visibility === 'visible' && c.opacity !== '0' && c.rect.w > 0));
    report.consoleMsgs = consoleMsgs.slice(0, 40);
    report.bridgeLog = bridgeLog.slice(0, 40);
    report.lensRequests = bridgeLog.filter(b => /lens\.google|google\.com\/.*lens|crupload/i.test(b.url)).length;

    const shotPath = path.join(ARTIFACTS, 'bookwalker-probe.png');
    await page.screenshot({ path: shotPath, fullPage: false, timeout: 15000 }).catch(e => console.log('[probe] screenshot failed:', String(e).split('\n')[0]));
    const outPath = path.join(ARTIFACTS, 'bookwalker-probe.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n[probe] screenshot -> ${shotPath}\n[probe] report -> ${outPath}`);

    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
}

main().catch(e => { console.error(e); process.exitCode = 1; });
