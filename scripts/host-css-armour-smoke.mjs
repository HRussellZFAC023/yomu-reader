#!/usr/bin/env node
// Smoke: a hostile host stylesheet must not be able to restyle Yomu's chrome,
// and Yomu must not restyle the host's.
//
// The host page here reproduces the attack CLASS, not one site. Every rule below
// was lifted verbatim from a real page (https://yomuapp.jp/reader, which the
// owner reported as "Yomu's CSS clashes in many places"), but none of them names
// Yomu: they reach it through `*` and through bare element selectors that any
// theme-switching site writes. That is precisely why specificity cannot answer
// them and why src/reader/styles/host-armour.ts answers with a cascade layer.
//
//   node scripts/host-css-armour-smoke.mjs            # synthetic hostile host
//   node scripts/host-css-armour-smoke.mjs <url>      # a real page instead
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const CSS = path.join(ROOT, 'dist/yomu.css');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const LIVE_URL = process.argv[2];
const HOST_ORIGIN = 'https://hostile-host.test';

// Companions come from the userscript's own @require list: loading a subset
// silently produces a page where readings parse but never paint.
const COMPANIONS = readFileSync(USERSCRIPT, 'utf8')
    .split(/\r?\n/u)
    .flatMap(line => {
        const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
        if (!match) return [];
        const hashed = path.basename(match[1]);
        // A freshly built tree carries un-synced, un-hashed companions; a synced
        // one carries the content-addressed names the userscript @requires.
        const plain = hashed.replace(/\.[0-9a-f]{8,}\.user\.js$/u, '.user.js');
        const candidates = [
            path.join(ROOT, 'docs/public/greasyfork', hashed),
            path.join(ROOT, 'dist/greasyfork', plain),
            path.join(ROOT, 'docs/public/greasyfork', plain),
        ];
        const found = candidates.find(candidate => existsSync(candidate));
        if (!found) throw new Error(`Companion not found for @require ${hashed} (run npm run build)`);
        return [found];
    });

// Verbatim from the host sheet under test. Each reaches Yomu without naming it.
const HOSTILE_CSS = `
:root { --text-primary: #ffffff; --bg-secondary: #1e1e1e; --border: #3c3c3c80; }
html, body { background: #2b2f36; color: #fff; font-family: sans-serif; }
*, ::after, ::before { border-radius: 0 !important; }
:not(.theme-x.style-rich) * { transition: background-color .2s, color .2s, border-color .2s, box-shadow .2s !important; }
:not(.theme-x.style-rich) a, :not(.theme-x.style-rich) button, :not(.theme-x.style-rich) div,
:not(.theme-x.style-rich) h1, :not(.theme-x.style-rich) h2, :not(.theme-x.style-rich) h3,
:not(.theme-x.style-rich) input, :not(.theme-x.style-rich) p, :not(.theme-x.style-rich) select,
:not(.theme-x.style-rich) span, :not(.theme-x.style-rich) textarea { color: var(--text-primary) !important; }
.style-flat button:not(.theme-option) {
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
/* The host's own control, which Yomu must leave exactly as the host painted it. */
#host-control { border-radius: 12px; background: #4f46e5; border: 3px solid #10b981; box-shadow: 0 2px 6px #0008; }
`;

const HOST_HTML = `<!doctype html><html lang="ja" class="theme-graphite style-flat"><head><meta charset="utf-8">
<title>Hostile host</title><style>${HOSTILE_CSS}</style></head><body>
<main><p id="text">日本語の文章を読む練習をします。今日は天気がとても良いですね。</p>
<button id="host-control" class="theme-option">ホストの操作子</button></main></body></html>`;

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    ankiEnabled: false,
    localDictionariesEnabled: true,
    showFloatingButton: true,
    furiganaMode: 'all',
    subtitlePlayerEnabled: false,
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
  window.GM_info = { script: { version: 'smoke', name: 'yomu' }, scriptHandler: 'SmokeGM' };
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

const failures = [];
const notes = [];

function check(name, actual, predicate, expectation) {
    if (predicate(actual)) {
        notes.push(`  ok   ${name}: ${actual}`);
        return;
    }
    failures.push(`  FAIL ${name}: got ${actual}, expected ${expectation}`);
}

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', bypassCSP: true });
    if (!LIVE_URL) {
        await context.route(`${HOST_ORIGIN}/**`, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST_HTML }));
    }
    await context.addInitScript({ content: gmShim });
    for (const companion of COMPANIONS) await context.addInitScript({ path: companion });
    await context.addInitScript({ path: USERSCRIPT });

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error).slice(0, 200)));
    await page.goto(LIVE_URL ?? `${HOST_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('.jpdb-reader-fab', { timeout: 60_000 });
    // The FAB paints from the full sheet, which arrives asynchronously when the
    // GM resource is unavailable; give the swap time to land before measuring.
    await page.waitForTimeout(8_000);

    const report = await page.evaluate(() => {
        const read = (selector, properties) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const style = getComputedStyle(element);
            const out = {};
            for (const property of properties) out[property] = style.getPropertyValue(property);
            const rect = element.getBoundingClientRect();
            out['@rect'] = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
            return out;
        };
        const layers = [...document.styleSheets].flatMap(sheet => {
            try {
                return [...sheet.cssRules].filter(rule => rule.constructor.name === 'CSSLayerBlockRule').map(rule => rule.name);
            } catch {
                return [];
            }
        });
        return {
            armourLayers: layers.filter(name => name.startsWith('jpdb-reader-armour')),
            fab: read('.jpdb-reader-fab', ['border-radius', 'background-color', 'border-top-width', 'border-top-color', 'color', 'box-shadow']),
            hostControl: read('#host-control', ['border-radius', 'background-color', 'border-top-width', 'border-top-color', 'box-shadow']),
            words: document.querySelectorAll('.jpdb-reader-word').length,
        };
    });

    if (!report.fab) throw new Error('Yomu floating button never rendered — cannot judge the armour.');

    check('armour layers installed', report.armourLayers.join(','), value => value.includes('jpdb-reader-armour'), 'jpdb-reader-armour layer present');
    check('words annotated', report.words, value => value > 0, '> 0');

    // Yomu's chrome keeps Yomu's paint despite the host's `!important`.
    check('fab border-radius', report.fab['border-radius'], value => value !== '0px', 'not 0px (host forced `*{border-radius:0!important}`)');
    check('fab background', report.fab['background-color'], value => !/^rgba\(0, 0, 0, 0\)$/.test(value), 'opaque (host forced `background:transparent!important`)');
    check('fab border-width', report.fab['border-top-width'], value => value !== '0px', 'not 0px (host forced `border:none!important`)');
    check('fab box-shadow', report.fab['box-shadow'], value => value !== 'none', 'not none (host forced `box-shadow:none!important`)');
    // Readability: the label must not be the host's forced colour, or it renders
    // white-on-white against Yomu's own light surface.
    check('fab label colour', report.fab.color, value => value !== 'rgb(255, 255, 255)', 'Yomu\'s own text colour, not the host\'s forced #fff');
    check('fab size', report.fab['@rect'], value => value === '52x52', '52x52 (no growth, no clipping)');

    // ...and the host's own control keeps the host's paint: the armour must
    // never make Yomu the aggressor.
    if (report.hostControl) {
        check('host control border-radius', report.hostControl['border-radius'], value => value === '0px', '0px — the host\'s own !important still wins on the host\'s nodes');
        check('host control background', report.hostControl['background-color'], value => value === 'rgb(79, 70, 229)', 'rgb(79, 70, 229) — untouched by Yomu');
        check('host control border-width', report.hostControl['border-top-width'], value => value === '3px', '3px — untouched by Yomu');
    }

    console.log(`host-css-armour smoke (${LIVE_URL ?? HOST_ORIGIN})`);
    console.log(notes.join('\n'));
    if (pageErrors.length > 0) console.log(`  page errors: ${JSON.stringify(pageErrors.slice(0, 3))}`);
    if (failures.length > 0) {
        console.error(failures.join('\n'));
        process.exitCode = 1;
    } else {
        console.log('PASS');
    }
} finally {
    await browser.close();
}
