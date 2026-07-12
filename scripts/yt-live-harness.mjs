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
const PROFILE = process.env.YT_PROFILE || '/tmp/yomu-signed-fresh';
const DIST = process.env.YT_DIST || path.join(APP, 'dist');

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
    'greasyfork/yomu-ocr-manga.user.js',
    'greasyfork/yomu-ui-copy.user.js',
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
    // Flicker (reactivity thrash) + pitch-accent coverage. Idle churn = thrash
    // (words/mirrors removed+re-added with no content change); scroll churn is
    // expected (new videos). hostStyle = mirror-observer re-assert fights.
    explore: async () => {
        const c = { wordAdd: 0, wordRemove: 0, mirrorAdd: 0, mirrorRemove: 0, hostStyle: 0 };
        const isWord = n => n.nodeType === 1 && (n.matches?.('.jpdb-reader-word') || n.querySelector?.('.jpdb-reader-word'));
        const obs = new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) { if (isWord(n)) c.wordAdd++; if (n.nodeType === 1 && n.matches?.('.jpdb-reader-text-mirror')) c.mirrorAdd++; }
                for (const n of m.removedNodes) { if (isWord(n)) c.wordRemove++; if (n.nodeType === 1 && n.matches?.('.jpdb-reader-text-mirror')) c.mirrorRemove++; }
                if (m.type === 'attributes' && m.attributeName === 'style' && m.target.querySelector?.('.jpdb-reader-text-mirror')) c.hostStyle++;
            }
        });
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        await sleep(7000);
        const idle = { ...c };
        Object.keys(c).forEach(k => (c[k] = 0));
        window.scrollBy(0, 1400); await sleep(2000);
        window.scrollBy(0, 1800); await sleep(2000);
        window.scrollBy(0, -2000); await sleep(2500);
        const scroll = { ...c };
        obs.disconnect();
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
        const withPitch = words.filter(w => (w.dataset.pitchClass || '').length > 0);
        const colored = words.filter(w => Array.from(w.classList).some(x => x.startsWith('jpdb-pitch-') && x !== 'jpdb-pitch-'));
        const sampleMissing = words.filter(w => !(w.dataset.pitchClass || '')).slice(0, 10).map(w => w.dataset.surface || (w.textContent || '').slice(0, 8));
        return { idleChurn: idle, scrollChurn: scroll, words: words.length, withPitchClass: withPitch.length, coloredPitch: colored.length, pitchPct: Math.round(100 * withPitch.length / Math.max(1, words.length)), sampleMissingPitch: sampleMissing };
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
    // Live release acceptance for annotation geometry and lazy coverage.
    acceptance: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const expand = document.querySelector('#description-inline-expander #expand, #description #expand, ytd-text-inline-expander #expand');
        if (expand instanceof HTMLElement) expand.click();
        await sleep(1200);
        const rect = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
        };
        const overlap = (first, second) => Boolean(first && second
            && Math.min(first.right, second.right) > Math.max(first.left, second.left)
            && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top));
        const description = rect('#description-inline-expander, ytd-text-inline-expander, ytd-watch-metadata #description, yt-description-preview-view-model, yt-description-view-model');
        const video = rect('#movie_player, ytd-player');
        const secondary = rect('#secondary');
        const controlSamples = Array.from(document.querySelectorAll('button .jpdb-reader-word, [role="button"] .jpdb-reader-word, [role="tab"] .jpdb-reader-word'))
            .slice(0, 30)
            .map(word => {
                const control = word.closest('button,[role="button"],[role="tab"]');
                const controlRect = control?.getBoundingClientRect();
                const wordRect = word.getBoundingClientRect();
                return {
                    text: (word.dataset.expression || word.textContent || '').trim(),
                    readingCount: word.querySelectorAll('rt,.jpdb-reader-detached-furi').length,
                    centerDelta: controlRect ? Math.round((wordRect.top + wordRect.height / 2 - controlRect.top - controlRect.height / 2) * 10) / 10 : null,
                };
            });
        const collapse = document.querySelector('#description-inline-expander #collapse, #description #collapse, ytd-text-inline-expander #collapse');
        if (collapse instanceof HTMLElement) collapse.click();
        await sleep(600);
        const comments = document.querySelector('ytd-comments') || document.querySelector('#comments');
        comments?.scrollIntoView({ block: 'start' });
        await sleep(2500);
        window.scrollBy(0, 1200);
        await sleep(1500);
        const loadedJapaneseHosts = Array.from(document.querySelectorAll('ytd-comment-view-model #content-text,ytd-comment-renderer #content-text,ytm-comment-renderer #content-text'))
            .filter(element => /[぀-ヿ㐀-鿿]/.test(element.textContent || ''));
        const visibleJapaneseHosts = loadedJapaneseHosts
            .filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
                    && /[぀-ヿ㐀-鿿]/.test(element.textContent || '');
            });
        const unannotated = visibleJapaneseHosts
            .filter(element => !element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror'))
            .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 20);
        return {
            descriptionExpanded: Boolean(expand),
            description,
            overlapsVideo: overlap(description, video),
            overlapsSecondary: overlap(description, secondary),
            controlSamples,
            maxControlCenterDelta: Math.max(0, ...controlSamples.map(sample => Math.abs(sample.centerDelta || 0))),
            controlsWithReadings: controlSamples.filter(sample => sample.readingCount > 0).map(sample => sample.text),
            commentsAvailable: Boolean(comments),
            loadedJapaneseCommentHosts: loadedJapaneseHosts.length,
            loadedAnnotatedCommentHosts: loadedJapaneseHosts.filter(element => element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).length,
            bottomVisibleJapaneseHosts: visibleJapaneseHosts.length,
            bottomUnannotated: unannotated,
        };
    },
    comments: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const comments = document.querySelector('ytd-comments') || document.querySelector('#comments');
        comments?.scrollIntoView({ block: 'start' });
        await sleep(3000);
        window.scrollBy(0, 900);
        await sleep(1800);
        const candidates = Array.from(document.querySelectorAll('ytd-comments yt-attributed-string,ytd-comments yt-formatted-string,ytd-comments .ytAttributedStringHost,ytd-comments #content-text'))
            .filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
                    && /[぀-ヿ㐀-鿿]/.test(element.textContent || '');
            });
        const summary = element => ({
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            annotated: Boolean(element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')),
        });
        return {
            commentsAvailable: Boolean(comments),
            visibleJapanese: candidates.map(summary),
            unannotated: candidates.filter(element => !element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).map(summary),
        };
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

const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless,
    viewport: { width, height },
    locale: 'ja-JP',
    bypassCSP: true,
    ...(process.env.YT_MOBILE === '1' ? { userAgent: mobileUA, isMobile: true, hasTouch: true } : {}),
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

const popoverState = () => page.evaluate(() => {
    const p = document.querySelector('.jpdb-reader-popover');
    return { open: Boolean(p) && p.getBoundingClientRect().width > 0, text: p ? (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) : '' };
});

// Deterministic live test of the popover re-anchor patch: open the popover by
// hovering a word, then simulate a YouTube reconcile by replacing the hovered
// node with a same-vid:sid clone, and confirm the popover survives + re-anchors
// instead of auto-dismissing. Also flags any flicker during the hover.
async function runHoverExploration() {
    const box = await page.evaluate(() => {
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
        const w = words.find(el => (el.dataset.surface || '').length >= 2 && /[぀-ヿ㐀-鿿]/.test(el.dataset.surface || el.textContent || '') && el.getBoundingClientRect().width > 0);
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), surface: w.dataset.surface || w.textContent, vid: w.dataset.vid, sid: w.dataset.sid };
    });
    if (!box) return { error: 'no hoverable word found' };
    await page.mouse.move(box.x - 40, box.y - 40);
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(1400);
    const afterOpen = await popoverState();
    await page.waitForTimeout(3000); // stationary — pre-fix bug would dismiss here on reconcile
    const afterStationary = await popoverState();
    // Force the reactive-replacement scenario the fix targets.
    const replaced = await page.evaluate(pt => {
        const el = document.elementFromPoint(pt.x, pt.y);
        const word = el && el.closest && el.closest('.jpdb-reader-word');
        if (!word || !word.parentNode) return false;
        word.replaceWith(word.cloneNode(true));
        return true;
    }, box);
    await page.waitForTimeout(1500); // hover-watch tick(s)
    const afterReconcile = await popoverState();
    await page.screenshot({ path: path.join(APP, `qa-artifacts/yt-hover-${width}x${height}.png`) }).catch(() => {});
    return { hovered: box.surface, vidSid: `${box.vid}:${box.sid}`, afterOpen, afterStationary, nodeReplaced: replaced, afterReconcile, reanchorSurvived: afterOpen.open && afterReconcile.open };
}

let result;
if (diagName === 'hover') {
    try { result = await runHoverExploration(); } catch (e) { result = { hoverError: String(e) }; }
} else {
    try { result = await page.evaluate(probe); } catch (e) { result = { evalError: String(e) }; }
}

const shot = path.join(APP, `qa-artifacts/yt-${diagName}-${width}x${height}.png`);
await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

console.log(JSON.stringify({ diag: diagName, url, viewport: `${width}x${height}`, jpdbKey: jpdbKey ? 'set' : 'none', result, consoleErrors: consoleErrors.slice(0, 8), shot }, null, 2));

await Promise.race([
    ctx.close(),
    new Promise(resolve => setTimeout(resolve, 3000)),
]).catch(() => undefined);
process.exit(0);
