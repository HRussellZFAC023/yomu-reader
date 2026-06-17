// Live Yomu repro harness: drives a CLONED signed-in Chrome profile, injects the
// built dist (companions + core) via a GM shim with a cross-origin jpdb bridge,
// navigates to a target, runs a diagnostic, screenshots. Read-only on the repo.
//
//   node scripts/yt-live-harness.mjs [diagName] [url] [width] [height]
//
// diagName selects a probe in DIAGS below. Env: YT_HEADLESS=1 for headless.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const APP = '/Users/heru/Documents/Projects/yomu/apps/yomu-reader';
const PROFILE = '/tmp/yomu-signed-fresh';
const DIST = path.join(APP, 'dist');

const diagName = process.argv[2] || 'overview';
const url = process.argv[3] || 'https://www.youtube.com/';
const width = Number(process.argv[4] || 1280);
const height = Number(process.argv[5] || 900);
const headless = process.env.YT_HEADLESS === '1';

function readDist(rel) {
    const p = path.join(DIST, rel);
    if (!existsSync(p)) throw new Error('missing dist file: ' + p);
    return readFileSync(p, 'utf8');
}
// Load order: companions before core (memory: video companion owns YouTube bits).
const SCRIPTS = [
    'greasyfork/yomu-settings-surface.user.js',
    'greasyfork/yomu-anki.user.js',
    'greasyfork/yomu-kanji-study.user.js',
    'greasyfork/yomu-video.user.js',
    'yomu.user.js',
].map(rel => ({ rel, code: readDist(rel) }));

// jpdb API key from .env (faithful furigana/colors).
let jpdbKey = '';
try {
    const env = readFileSync(path.join(APP, '.env'), 'utf8');
    jpdbKey = (env.match(/^YOMU_JPDB_API_KEY=(.*)$/m)?.[1] || '').trim();
} catch { /* none */ }

const SETTINGS = {
    onboardingSeen: true,
    apiKey: jpdbKey,
    jpdbMiningEnabled: true,
    interfaceLanguage: 'en',
};

const DIAGS = {
    // Broad health check + which surfaces got decorated.
    overview: () => {
        const words = document.querySelectorAll('.jpdb-reader-word').length;
        const furi = document.querySelectorAll('.jpdb-reader-furi').length;
        const mirrors = document.querySelectorAll('.jpdb-reader-text-mirror').length;
        const filtered = document.querySelectorAll('[data-yomu-youtube-filtered]').length;
        return { yomuPresent: Boolean(window.__yomuCompanions || words || mirrors), words, furi, mirrors, filtered };
    },
    // Title clipping: compare each mirror host box vs mirror box + clamp.
    titles: () => {
        const out = [];
        for (const m of document.querySelectorAll('.jpdb-reader-text-mirror')) {
            const host = m.parentElement;
            if (!host) continue;
            const hr = host.getBoundingClientRect();
            const mr = m.getBoundingClientRect();
            const cs = getComputedStyle(host);
            const clampBox = host.closest('[style*="line-clamp"],.yt-core-attributed-string--white-space-pre-wrap') || host;
            const cbcs = getComputedStyle(clampBox);
            out.push({
                hostClass: host.className?.toString().slice(0, 60),
                src: (m.dataset.sourceText || '').slice(0, 40),
                host: { w: Math.round(hr.width), h: Math.round(hr.height) },
                mirror: { w: Math.round(mr.width), h: Math.round(mr.height) },
                overflowsHost: Math.round(mr.height) - Math.round(hr.height) > 4 || Math.round(mr.width) - Math.round(hr.width) > 4,
                hostDisplay: cs.display, hostPosition: cs.position, hostOverflow: cs.overflow,
                clampLine: cbcs.webkitLineClamp, clampOverflow: cbcs.overflow,
                mirrorInset: m.style.inset, mirrorWidth: m.style.width, mirrorWhiteSpace: m.style.whiteSpace,
            });
        }
        const overflowing = out.filter(o => o.overflowsHost);
        const titles = out.filter(o => o.host.w > 120);
        return { count: out.length, overflowingCount: overflowing.length, overflowing: overflowing.slice(0, 8), titles: titles.slice(0, 8) };
    },
    // Segmentation of kana words on the page.
    segments: () => {
        const groups = {};
        for (const w of document.querySelectorAll('.jpdb-reader-word')) {
            const host = w.closest('a,span,div')?.textContent?.slice(0, 24) || '';
            (groups[host] ||= []).push(w.dataset.surface || w.textContent);
        }
        const kana = Object.entries(groups)
            .filter(([k]) => /[぀-ゟ]/.test(k))
            .slice(0, 20)
            .map(([k, v]) => ({ container: k, words: v }));
        return { kana };
    },
    // Empirically validate the geometry fix on a real broken title mirror.
    fixprobe: () => {
        const results = [];
        for (const m of document.querySelectorAll('.jpdb-reader-text-mirror')) {
            const host = m.parentElement;
            if (!host) continue;
            const hr = host.getBoundingClientRect();
            const mrBefore = m.getBoundingClientRect();
            const collapsed = mrBefore.width < hr.width - 4;
            if (!collapsed || hr.width < 120) continue;
            const cs = getComputedStyle(host);
            const before = { hostW: Math.round(hr.width), mW: Math.round(mrBefore.width), mH: Math.round(mrBefore.height), hostDisplay: cs.display };
            // Apply candidate fix in place.
            if (cs.display === 'inline') host.style.setProperty('display', 'inline-block', 'important');
            m.style.setProperty('inset', '0 0 auto 0');
            m.style.removeProperty('width');
            m.style.removeProperty('min-width');
            // force reflow
            void host.offsetWidth;
            const hr2 = host.getBoundingClientRect();
            const mr2 = m.getBoundingClientRect();
            results.push({ src: (m.dataset.sourceText || '').slice(0, 30), before, after: { hostW: Math.round(hr2.width), mW: Math.round(mr2.width), mH: Math.round(mr2.height) } });
            if (results.length >= 8) break;
        }
        return { fixedSamples: results };
    },
};

const probe = DIAGS[diagName] || DIAGS.overview;

const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless,
    viewport: { width, height },
    locale: 'ja-JP',
    bypassCSP: true,
    args: ['--disable-blink-features=AutomationControlled'],
});

// Cross-origin GM_xmlhttpRequest bridge (CORS-free, server-side fetch).
await ctx.exposeFunction('__yomuReq', async (opts) => {
    try {
        const res = await ctx.request.fetch(opts.url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            data: opts.data,
            timeout: 20000,
        });
        const body = await res.text();
        const headers = res.headers();
        return { status: res.status(), statusText: '', responseText: body,
            responseHeaders: Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') };
    } catch (e) { return { status: 0, error: String(e) }; }
});

const initScript = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ 'jpdb-popup-reader-settings': SETTINGS })}));
  const listeners = new Map();
  const enc = v => JSON.stringify(v);
  const dec = v => { try { return JSON.parse(v); } catch { return v; } };
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = (k) => store.delete(k);
  window.GM_listValues = () => Array.from(store.keys());
  window.GM_addValueChangeListener = (k, f) => { const a=listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = (u) => window.open(u, '_blank');
  window.GM_getResourceText = () => '';
  window.GM_info = { script: { version: '1.2.0', name: 'yomu' }, scriptHandler: 'HarnessGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: u=>window.open(u,'_blank'),
    xmlHttpRequest: (o)=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = (o) => {
    Promise.resolve(window.__yomuReq({ method:o.method, url:o.url, headers:o.headers, data:o.data }))
      .then(r => { if (r && r.status && o.onload) o.onload({ status:r.status, statusText:r.statusText||'', responseText:r.responseText||'', response:r.responseText||'', responseHeaders:r.responseHeaders||'', finalUrl:o.url }); else if (o.onerror) o.onerror(r||{status:0}); })
      .catch(e => { if (o.onerror) o.onerror({ status:0, error:String(e) }); });
    return { abort(){} };
  };
})();
`;
await ctx.addInitScript({ content: initScript });
for (const s of SCRIPTS) {
    // Run each dist file at document-start in the page's main world.
    await ctx.addInitScript({ content: s.code });
}

const page = ctx.pages()[0] || await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('PAGEERR ' + String(e).slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Let YouTube hydrate + Yomu scan + jpdb parse settle.
await page.waitForTimeout(9000);

let result;
try { result = await page.evaluate(probe); } catch (e) { result = { evalError: String(e) }; }

const shot = path.join(APP, `qa-artifacts/yt-${diagName}-${width}x${height}.png`);
await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

console.log(JSON.stringify({ diag: diagName, url, viewport: `${width}x${height}`, jpdbKey: jpdbKey ? 'set' : 'none', result, consoleErrors: consoleErrors.slice(0, 8), shot }, null, 2));

await ctx.close();
