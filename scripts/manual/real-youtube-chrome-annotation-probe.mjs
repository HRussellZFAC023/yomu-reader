#!/usr/bin/env node
// Manual probe: load the REAL youtube.com in a real engine with the built
// userscript, then report which on-page surfaces actually received annotations.
//
// Exists because the synthetic fixtures assert chrome is annotated at rest and
// pass, while the owner's iPad screenshots of the same surfaces show buttons and
// metadata bare. Something about the real page differs from the fixtures, so
// this measures the real one rather than arguing from the fixture.
//
// Signed out on purpose: no credentials, and a watch page still carries the
// reported shapes (action buttons, view-count/date metadata, chips, guide rail).
//
//   node scripts/manual/real-youtube-chrome-annotation-probe.mjs [videoId]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const USERSCRIPT_SOURCE = USERSCRIPT;
const CSS = path.join(ROOT, 'dist/yomu.css');
// Resolve companions from the userscript's own @require list rather than a
// hardcoded subset: the detached-reading projection lives in the annotations
// companion, and omitting it silently produces a page where readings parse but
// nothing is ever painted — which looks exactly like the bug under test.
const COMPANIONS = readFileSync(USERSCRIPT_SOURCE, 'utf8')
    .split(/\r?\n/u)
    .flatMap(line => {
        const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
        if (!match) return [];
        const fileName = path.basename(match[1]);
        return [path.join(ROOT, 'docs/public/greasyfork', fileName)];
    });
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const VIDEO_ID = process.argv[2] ?? 'Zt0GNAKuJIA';

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: true,
    showFloatingButton: true,
    furiganaMode: 'all',
    subtitlePlayerEnabled: false,
    youtubeImmersionEnabled: false,
};

const gmShim = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ [SETTINGS_KEY]: settings })}));
  const listeners = new Map();
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = k => store.delete(k);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (k, f) => { const a = listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  window.GM_getResourceText = n => n === 'yomuCss' ? ${JSON.stringify(readFileSync(CSS, 'utf8'))} : '';
  window.GM_info = { script: { version: 'probe', name: 'yomu' }, scriptHandler: 'ProbeGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: ()=>{}, xmlHttpRequest: o=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = o => {
    fetch(o.url, { method: o.method || 'GET', headers: o.headers, body: o.data })
      .then(async r => { const t = await r.text(); o.onload?.({ status: r.status, statusText: '', responseText: t, response: t, responseHeaders: '', finalUrl: o.url }); })
      .catch(e => o.onerror?.({ status: 0, error: String(e) }));
    return { abort(){} };
  };
})();`;

// The surfaces the owner circled, described by role rather than by brittle id.
const SURFACES = [
    { key: 'masthead create', selector: 'ytd-masthead ytd-button-renderer, ytd-masthead button' },
    { key: 'action buttons (share/save)', selector: '#top-level-buttons-computed button, #actions button' },
    { key: 'subscribe', selector: '#subscribe-button button, ytd-subscribe-button-renderer button' },
    { key: 'view/date metadata', selector: '#info-container, ytd-watch-metadata #info' },
    { key: 'filter chips', selector: 'yt-chip-cloud-chip-renderer' },
    { key: 'guide rail', selector: 'ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer' },
    { key: 'video titles (control)', selector: '#video-title, ytd-watch-metadata h1' },
    { key: 'description', selector: '#description-inline-expander' },
];

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja,en;q=0.8' },
        bypassCSP: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
    await context.addInitScript({ content: gmShim });
    for (const companion of COMPANIONS) await context.addInitScript({ path: companion });
    await context.addInitScript({ path: USERSCRIPT });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}&hl=ja`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Give the reader time to boot, scan, and run its settle sweep.
    await page.waitForTimeout(15_000);
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(6_000);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(4_000);

    const report = await page.evaluate(surfaces => {
        const hasJapanese = text => /[぀-ヿ㐀-鿿]/.test(text);
        const paints = clone => {
            const style = getComputedStyle(clone);
            const rect = clone.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const projected = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')];
        return {
            readerBooted: Boolean(document.querySelector('.jpdb-reader-fab, [data-jpdb-reader-root]')),
            consentWall: Boolean(document.querySelector('[aria-modal="true"]')
                && /Cookie|cookie/.test(document.body.textContent ?? '')),
            totalWords: document.querySelectorAll('.jpdb-reader-word').length,
            // Distinguish "no reading data at all" from "reading parsed but not
            // painted": the source lane is written at parse time, the clone at
            // paint time. Zero sources means the probe has no dictionary, not a
            // projection defect.
            sourceReadings: document.querySelectorAll('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])').length,
            inlineRuby: document.querySelectorAll('.jpdb-reader-word rt').length,
            wordsWithPitch: [...document.querySelectorAll('.jpdb-reader-word')]
                .filter(w => w.dataset.pitchClass && w.dataset.pitchClass !== 'unknown').length,
            totalProjected: projected.length,
            visibleProjected: projected.filter(paints).length,
            // Which readings failed to paint, and by what mechanism. display:none
            // is the occlusion/visibility verdict; a zero box is a measurement
            // failure. Both look identical to a user: the furigana is missing.
            hidden: projected.filter(c => !paints(c)).slice(0, 12).map(c => {
                const cs = getComputedStyle(c);
                const r = c.getBoundingClientRect();
                return {
                    text: c.textContent,
                    display: cs.display,
                    visibility: cs.visibility,
                    width: Math.round(r.width),
                    documentSpace: c.classList.contains('jpdb-reader-projected-furi-document'),
                    stampedTop: c.dataset.yomuSourceTop ?? null,
                    // Content behind a modal is correctly blanked; distinguish
                    // that from a reading lost on a surface the user can see.
                    behindModal: Boolean(c.dataset.yomuExpression && [...document.querySelectorAll('.jpdb-reader-word')]
                        .filter(w => w.textContent?.includes(c.dataset.yomuExpression))
                        .some(w => w.closest('[aria-hidden="true"],[inert]'))),
                };
            }),
            diag: (() => {
                const src = document.querySelector('.jpdb-reader-detached-furi:not([data-yomu-projected-reading])');
                if (!src) return null;
                const word = src.closest('.jpdb-reader-word');
                const host = src.closest('[data-yomu-decoration]');
                const cs = getComputedStyle(src);
                return {
                    text: src.textContent,
                    srcDisplay: cs.display,
                    srcVisibility: cs.visibility,
                    inMirror: Boolean(src.closest('.jpdb-reader-text-mirror')),
                    controlMirror: src.closest('.jpdb-reader-text-mirror')?.dataset.yomuControlMirror ?? null,
                    detachedFlag: src.closest('.jpdb-reader-text-mirror')?.dataset.yomuDetachedReadings ?? null,
                    decoration: host?.getAttribute('data-yomu-decoration') ?? null,
                    wordRect: word ? JSON.parse(JSON.stringify(word.getBoundingClientRect())) : null,
                    overlayLayers: document.querySelectorAll('.jpdb-reader-detached-reading-overlay').length,
                    hasDiagnosticsHook: typeof window.__yomuProjectedReadingDiagnostics === 'function',
                };
            })(),
            surfaces: surfaces.map(surface => {
                const hosts = [...document.querySelectorAll(surface.selector)];
                const japanese = hosts.filter(host => hasJapanese(host.textContent ?? ''));
                const annotated = japanese.filter(host => host.querySelector('.jpdb-reader-word'));
                const withReading = japanese.filter(host => {
                    const words = [...host.querySelectorAll('.jpdb-reader-word')];
                    return words.some(word => word.querySelector('.jpdb-reader-detached-furi, rt'));
                });
                return {
                    key: surface.key,
                    hosts: hosts.length,
                    japaneseHosts: japanese.length,
                    annotated: annotated.length,
                    withReading: withReading.length,
                    sample: japanese[0]?.textContent?.trim().slice(0, 30) ?? '',
                };
            }),
        };
    }, SURFACES);

    console.log(JSON.stringify({ videoId: VIDEO_ID, ...report, pageErrors: errors.slice(0, 3) }, null, 2));
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'real-youtube-chrome-probe.png'), fullPage: false });
} finally {
    await browser.close();
}
