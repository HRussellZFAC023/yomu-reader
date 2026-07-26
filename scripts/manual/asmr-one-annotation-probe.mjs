#!/usr/bin/env node
// Manual probe: real asmr-200.com (a Kikoeru/ASMR.one instance) with the built
// userscript, with and without the owner's own "ASMR.one Ultimate"
// (voiceworks-toolkit) userscript loaded alongside it.
//
// Reported symptoms on that page:
//   1. Yomu annotates NOTHING (no furigana, no underline, no highlight).
//   2. Yomu's settings dialog renders unstyled (native selects/checkboxes).
//   3. voiceworks' inline translations are DUPLICATED on the breadcrumb line.
//
// The decisive comparison is Yomu ALONE vs Yomu + voiceworks; run both.
//
//   node scripts/manual/asmr-one-annotation-probe.mjs [--with-voiceworks]
//                                                     [--shipped|--dist]
//                                                     [--engine chromium|firefox|webkit]
//                                                     [--open-settings]
//                                                     [--url <url>]
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as playwright from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/3f49dfc4-58d4-436d-8d70-f4dc54c5f3d8/scratchpad/asmr-probe';

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const WITH_VOICEWORKS = flag('--with-voiceworks');
const USE_SHIPPED = !flag('--dist');
const ENGINE = value('--engine', 'chromium');
const OPEN_SETTINGS = flag('--open-settings');
const URL_UNDER_TEST = value('--url', 'https://asmr-200.com/work/RJ01052162');
const SETTLE_MS = Number(value('--settle', '25000'));

// The shipped build is the committed dist at HEAD (v1.8.7 — what the owner
// actually runs). --dist probes the working tree's rebuilt dist, which may
// carry another agent's unshipped changes.
const BUILD_DIR = USE_SHIPPED ? path.join(SCRATCH, 'shipped') : path.join(SCRATCH, 'dist');
const USERSCRIPT = path.join(BUILD_DIR, 'yomu.user.js');
const CSS = path.join(BUILD_DIR, 'yomu.css');
const VOICEWORKS = path.join(
    '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/3f49dfc4-58d4-436d-8d70-f4dc54c5f3d8/scratchpad/voiceworks',
    'asmr-one-ultimate.user.js',
);
const SETTINGS_KEY = 'jpdb-popup-reader-settings';

// Resolve companions from the userscript's own @require list: loading a subset
// silently produces a page where readings parse but never paint, which mimics
// the bug under test.
const COMPANIONS = readFileSync(USERSCRIPT, 'utf8')
    .split(/\r?\n/u)
    .flatMap(line => {
        const match = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
        return match ? [path.join(ROOT, 'docs/public/greasyfork', path.basename(match[1]))] : [];
    });
for (const companion of COMPANIONS) {
    if (!existsSync(companion)) throw new Error(`Missing companion: ${companion}`);
}

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
  window.__probeGmAddStyle = [];
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = k => store.delete(k);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (k, f) => { const a = listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  // Real managers queue GM_addStyle until there is a document to attach to;
  // at @run-at document-start both head and documentElement can still be null,
  // and throwing there kills the calling userscript before it ever boots.
  window.GM_addStyle = css => {
    window.__probeGmAddStyle.push(String(css).length);
    const style = document.createElement('style');
    style.textContent = css;
    style.dataset.probeGmAddStyle = 'true';
    const attach = () => {
      const parent = document.head || document.documentElement;
      if (parent) parent.appendChild(style);
      else requestAnimationFrame(attach);
    };
    attach();
    return style;
  };
  // --no-resource-css reproduces the owner's installed state: the shipped
  // 1.8.7 metadata block pins @resource yomuCss to
  // https://yomureader.com/yomu.76513423ef7a.css, and that URL now 404s
  // (the host only keeps the CURRENT release's content-hashed sheet — it is
  // serving 1.8.9's yomu.fd5e193e82d9.css). A failed @resource makes
  // GM_getResourceText return nothing.
  window.GM_getResourceText = n => n === 'yomuCss' ? ${JSON.stringify(flag('--no-resource-css') ? '' : readFileSync(CSS, 'utf8'))} : '';
  window.GM_info = { script: { version: 'probe', name: 'yomu' }, scriptHandler: 'ProbeGM' };
  window.unsafeWindow = window;
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: ()=>{}, addStyle: c=>window.GM_addStyle(c),
    xmlHttpRequest: o=>window.GM_xmlhttpRequest(o),
  };
  // Real GM_xmlhttpRequest is cross-origin. A page-fetch shim is CORS-bound, so
  // Yomu's jiten parse and voiceworks' translate calls both fail and BOTH
  // scripts degrade into a state the owner never sees. __probeGmFetch is a
  // Node-side bridge (page.exposeFunction) that performs the request outside
  // the page's origin, like a real userscript manager.
  window.GM_xmlhttpRequest = o => {
    const run = async () => {
      try {
        const r = await window.__probeGmFetch({ url: o.url, method: o.method || 'GET', headers: o.headers, data: o.data });
        if (r.error) { o.onerror?.({ status: 0, error: r.error }); return; }
        o.onload?.({ status: r.status, statusText: r.statusText, responseText: r.body, response: r.body, responseHeaders: r.headers, finalUrl: r.finalUrl });
      } catch (e) { o.onerror?.({ status: 0, error: String(e) }); }
    };
    void run();
    return { abort(){} };
  };
})();`;

// Count DOM mutations independently of either script so a scan/mutation
// feedback loop shows up as a raw rate, not an inference.
const mutationCounter = `
(() => {
  window.__probeMutations = { total: 0, byYomu: 0, byOther: 0, samples: [], started: Date.now(), buckets: {} };
  const start = () => {
    const observer = new MutationObserver(records => {
      const m = window.__probeMutations;
      const second = Math.floor((Date.now() - m.started) / 1000);
      m.buckets[second] = (m.buckets[second] || 0) + records.length;
      for (const record of records) {
        m.total += 1;
        const added = [...record.addedNodes];
        const yomu = added.some(n => n.nodeType === 1 && (
          (n.className && String(n.className.baseVal ?? n.className).includes('jpdb-reader'))
          || (n.dataset && Object.keys(n.dataset).some(k => k.startsWith('yomu') || k.startsWith('jpdb')))
        ));
        if (yomu) m.byYomu += 1; else if (added.length) m.byOther += 1;
        if (m.samples.length < 40 && added.length) {
          const n = added[0];
          m.samples.push({
            target: record.target.nodeType === 1 ? (record.target.tagName + '.' + String(record.target.className || '').slice(0, 60)) : String(record.target.nodeName),
            added: n.nodeType === 1 ? (n.tagName + '.' + String(n.className?.baseVal ?? n.className ?? '').slice(0, 60)) : ('#text:' + String(n.textContent).slice(0, 30)),
          });
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', function once() { if (document.documentElement) { document.removeEventListener('readystatechange', once); start(); } });
})();`;

const engine = playwright[ENGINE];
const browser = await engine.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        // asmr.one 403s ("remember, no english") any top-level navigation whose
        // Accept-Language is not Chinese-first — including ja-JP. The owner's
        // own script recovers from that gate with exactly this header
        // (voiceworks src/core/RegionGateRecovery.ts RECOVERY_ACCEPT_LANGUAGE),
        // so the probe pins the same locale to reach the real SPA.
        // Playwright's `locale` sets Accept-Language too and wins over
        // extraHTTPHeaders, so both must say zh.
        locale: 'zh-CN',
        userAgent: ENGINE === 'chromium'
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
            : undefined,
        extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9,en-GB;q=0.8,en;q=0.7' },
        bypassCSP: true,
    });
    // Must exist before the GM shim's first call; exposeBinding is per-context.
    // --block-css-fallback: the owner's @resource yomuCss 404s AND the async
    // raw.githubusercontent fallback does not land. Tests whether a
    // critical-CSS-only reader explains "annotates nothing" + unstyled dialog.
    const blockCssFallback = flag('--block-css-fallback');
    if (blockCssFallback) {
        await context.route('**/yomu.css*', route => route.abort());
        await context.route('**/dist/yomu.css*', route => route.abort());
    }
    await context.exposeFunction('__probeGmFetch', async ({ url, method, headers, data }) => {
        if (blockCssFallback && /yomu\.css/.test(url)) return { error: 'blocked by probe' };
        try {
            const response = await fetch(url, { method, headers, body: data ?? undefined });
            return {
                status: response.status,
                statusText: response.statusText,
                body: await response.text(),
                headers: [...response.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n'),
                finalUrl: response.url,
            };
        } catch (error) {
            return { error: String(error).slice(0, 200) };
        }
    });
    await context.addInitScript({ content: gmShim });
    await context.addInitScript({ content: mutationCounter });
    // voiceworks is @run-at document-start and the owner installed it first;
    // load it before Yomu so the ordering matches the reported setup. Its own
    // @require chain (Vue + SystemJS + the named-register reset) must load
    // first or it throws at document-start and never boots — which silently
    // turns a "with voiceworks" run back into a "Yomu alone" run.
    if (WITH_VOICEWORKS) {
        // Two fidelity requirements, both of which silently degrade the run into
        // a "Yomu alone" run (or worse) when skipped:
        //
        //  1. Tampermonkey concatenates the @require bodies and the script body
        //     into ONE program sharing one scope. Playwright's addInitScript
        //     function-wraps each file, so a UMD bundle's `global.X = ...` never
        //     lands anywhere voiceworks can see and it throws at document-start.
        //  2. That shared scope is a SANDBOX, not the page's window. Injecting
        //     the @require'd Vue 3 straight onto `window` overwrites the Vue the
        //     site's own vendor bundle expects, and the site's SPA dies with
        //     "window.Vue.use is not a function" — a shim artifact that never
        //     happens under a real userscript manager.
        //
        // So: concatenate, then run under a `with`-scoped proxy global whose
        // writes stay in the sandbox and whose reads fall through to the page.
        const sources = [1, 2, 3, 4]
            .map(index => readFileSync(path.join(SCRATCH, 'vw-requires', `${index}.js`), 'utf8'))
            .concat(readFileSync(VOICEWORKS, 'utf8'));
        const sandboxed = `
(0,eval)(${JSON.stringify(`(function(){
  var __real = window;
  var __scope = { unsafeWindow: __real };
  __real.__probeVwSandbox = __scope;
  var __proxy = new Proxy(__scope, {
    has: function () { return true; },
    get: function (target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key];
      if (key === 'window' || key === 'globalThis' || key === 'self' || key === 'top' || key === 'parent') return __proxy;
      var value = __real[key];
      // Bind instance methods (setTimeout, addEventListener, fetch, ...) so a
      // bare call through the with-scope does not hand them the proxy as
      // receiver; leave constructors (MutationObserver, Promise, Map, ...)
      // alone so \`new\` still works.
      return (typeof value === 'function' && typeof key === 'string' && /^[a-z]/.test(key)) ? value.bind(__real) : value;
    },
    set: function (target, key, value) { target[key] = value; return true; },
    deleteProperty: function (target, key) { delete target[key]; return true; },
  });
  (function () { with (this) { ${sources.join('\n;\n')} } }).call(__proxy);
})();`)});`;
        await context.addInitScript({ content: sandboxed });
    }
    for (const companion of COMPANIONS) await context.addInitScript({ path: companion });
    await context.addInitScript({ path: USERSCRIPT });

    const page = await context.newPage();
    const consoleErrors = [];
    const consoleAll = [];
    const pageErrors = [];
    const responseHeaders = {};
    page.on('console', message => {
        const text = message.text().slice(0, 300);
        consoleAll.push(`${message.type()}: ${text}`);
        if (message.type() === 'error' || /companion|did not load|yomu/i.test(text)) consoleErrors.push(text);
    });
    page.on('pageerror', error => pageErrors.push(`${error.message} :: ${String(error.stack ?? '').slice(0, 500)}`));
    const badResponses = [];
    page.on('response', response => {
        if (response.url() === URL_UNDER_TEST || response.url().replace(/\/$/, '') === URL_UNDER_TEST.replace(/\/$/, '')) {
            Object.assign(responseHeaders, response.headers());
        }
        if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url().slice(0, 160)}`);
    });

    await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => scrollTo(0, 400));
    await page.waitForTimeout(10_000);

    const report = await page.evaluate(() => {
        const paints = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const projected = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')];
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        const jaRe = /[぀-ヿ㐀-鿿]/u;
        // How much Japanese is actually on the page at all — if this is ~0 the
        // "Yomu is inert" report is about content, not about Yomu.
        let jaTextNodes = 0;
        let jaChars = 0;
        const jaSamples = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue ?? '';
            if (!jaRe.test(text)) continue;
            jaTextNodes += 1;
            jaChars += text.length;
            if (jaSamples.length < 12) {
                const parent = node.parentElement;
                jaSamples.push({
                    text: text.trim().slice(0, 60),
                    parent: parent ? `${parent.tagName}.${String(parent.className || '').slice(0, 50)}` : null,
                    inShadow: node.getRootNode() !== document,
                    annotated: Boolean(parent?.closest('.jpdb-reader-word')),
                });
            }
        }
        // Style census: is the reader sheet present, and how big is it?
        const styleNodes = [...document.querySelectorAll('style,link[rel=stylesheet]')];
        const readerSheets = styleNodes
            .filter(n => n.tagName === 'STYLE' && /jpdb-reader/.test(n.textContent ?? ''))
            .map(n => ({
                id: n.id || null,
                dataset: { ...n.dataset },
                length: (n.textContent ?? '').length,
                hasSettingsRules: (n.textContent ?? '').includes('.jpdb-reader-settings'),
                hasPopoverRules: (n.textContent ?? '').includes('.jpdb-reader-popover'),
                parent: n.parentElement?.tagName ?? null,
                connected: n.isConnected,
            }));
        let accessibleSheets = 0;
        let inaccessibleSheets = 0;
        for (const sheet of document.styleSheets) {
            try { void sheet.cssRules.length; accessibleSheets += 1; } catch { inaccessibleSheets += 1; }
        }
        return {
            location: location.href,
            title: document.title,
            readyState: document.readyState,
            yomuBooted: {
                realApp: Boolean(window.__yomuRealApp),
                initialisedFlag: Boolean(window.__yomuReaderAppInitialized),
                fab: Boolean(document.querySelector('.jpdb-reader-fab')),
                root: document.querySelectorAll('[data-jpdb-reader-root]').length,
                companionKeys: Object.keys(window.__yomuCompanions ?? {}),
                settingsSurface: Boolean(window.__yomuCompanions?.settings?.SettingsDialogController),
            },
            voiceworks: {
                sandboxKeys: Object.keys(window.__probeVwSandbox ?? {}).slice(0, 20),
                systemJs: Boolean(window.__probeVwSandbox?.System ?? window.System),
                vue: Boolean(window.__probeVwSandbox?.Vue ?? window.Vue),
                stylesInjected: [...document.querySelectorAll('style[id^=asmr]')].map(s => s.id),
                mounted: document.querySelectorAll('[class*=asmr-],[id*=asmr-]').length,
                // voiceworks renders its inline gloss as CSS pseudo-content:
                //   .asmr-worktree-translation::after { content: " (" attr(data-asmrtag-translation) ")" }
                // so the gloss is NOT a DOM node. Count the carriers instead.
                tagged: document.querySelectorAll('[data-asmrtag]').length,
                translated: document.querySelectorAll('[data-asmrtag-translation]').length,
                worktreeGlossCarriers: document.querySelectorAll('.asmr-worktree-translation').length,
                // The reported symptom is a DOUBLED gloss. A gloss doubles when
                // two elements carrying the pseudo-element paint for one source
                // string — e.g. an original plus a copy of it. Look for carriers
                // that sit inside one of Yomu's mirrors.
                glossCarriersInsideYomuMirror: [...document.querySelectorAll('[data-asmrtag-translation]')]
                    .filter(n => n.closest('.jpdb-reader-text-mirror,.jpdb-reader-control-text-mirror,[data-yomu-control-mirror]')).length,
                // The reported symptom, measured as rendered: a line whose
                // visible text (DOM text + ::after pseudo-content) shows the
                // same "(gloss)" twice.
                doubledGlossLines: (() => {
                    const rendered = element => {
                        let out = '';
                        for (const node of element.childNodes) {
                            if (node.nodeType === 3) out += node.nodeValue;
                            else if (node.nodeType === 1) out += rendered(node);
                        }
                        const after = getComputedStyle(element, '::after').content;
                        if (after && after !== 'none' && after !== 'normal') out += after.replace(/^"|"$/g, '').replace(/\\"/g, '"');
                        return out;
                    };
                    const hits = [];
                    for (const carrier of document.querySelectorAll('[data-asmrtag-translation]')) {
                        const line = carrier.parentElement;
                        if (!line) continue;
                        const text = rendered(line);
                        const glosses = [...text.matchAll(/\(([^()]{2,40})\)/gu)].map(m => m[1]);
                        const repeated = glosses.filter((g, i) => glosses.indexOf(g) !== i);
                        if (repeated.length && hits.length < 8) {
                            hits.push({
                                rendered: text.replace(/\s+/g, ' ').trim().slice(0, 120),
                                repeated: [...new Set(repeated)],
                                lineClass: String(line.className || '').slice(0, 60),
                                mirrorSiblings: line.querySelectorAll('.jpdb-reader-control-text-mirror,.jpdb-reader-text-mirror').length,
                            });
                        }
                    }
                    return hits;
                })(),
                duplicatedGlossSamples: (() => {
                    const byKey = new Map();
                    for (const node of document.querySelectorAll('[data-asmrtag-translation]')) {
                        const key = `${node.dataset.asmrtag ?? ''}→${node.dataset.asmrtagTranslation ?? ''}`;
                        byKey.set(key, (byKey.get(key) ?? 0) + 1);
                    }
                    return [...byKey.entries()].filter(([, count]) => count > 1).slice(0, 10);
                })(),
                gmAddStyle: (window.__probeGmAddStyle ?? []).length,
            },
            words: words.length,
            wordsWithRuby: words.filter(w => w.querySelector('rt')).length,
            projectedTotal: projected.length,
            projectedVisible: projected.filter(paints).length,
            overlays: document.querySelectorAll('.jpdb-reader-detached-reading-overlay').length,
            jaTextNodes,
            jaChars,
            jaSamples,
            // Coverage by region. The owner's complaint is specifically that the
            // dense Japanese FILE NAMES carry nothing, so a page-wide word count
            // is not enough — annotation can be healthy on the title/tag block
            // and absent on the file tree.
            coverage: (() => {
                const regions = [
                    ['work-title', '.work-title, h1, h2, .text-h5, .text-h6'],
                    ['tags', '.q-chip, .q-badge'],
                    ['file-tree', '.q-tree, .q-tree__node, .q-item, [class*=folder], [class*=tree]'],
                    ['virtual-scroller', '.q-virtual-scroll, .q-virtual-scroll__content'],
                    ['drawer-nav', '.q-drawer, .q-item__label'],
                ];
                const jaRe = /[぀-ヿ㐀-鿿]/u;
                return regions.map(([name, selector]) => {
                    const roots = [...document.querySelectorAll(selector)];
                    let ja = 0;
                    let annotated = 0;
                    const unannotated = [];
                    for (const root of roots) {
                        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
                            if (!jaRe.test(node.nodeValue ?? '')) continue;
                            ja += 1;
                            if (node.parentElement?.closest('.jpdb-reader-word')) annotated += 1;
                            else if (unannotated.length < 6) {
                                unannotated.push({
                                    text: (node.nodeValue ?? '').trim().slice(0, 44),
                                    parent: `${node.parentElement?.tagName}.${String(node.parentElement?.className || '').slice(0, 46)}`,
                                });
                            }
                        }
                    }
                    return { name, roots: roots.length, jaTextNodes: ja, annotated, unannotated };
                });
            })(),
            styles: {
                totalStyleNodes: styleNodes.length,
                readerSheets,
                readerSheetTotalLength: readerSheets.reduce((sum, s) => sum + s.length, 0),
                accessibleSheets,
                inaccessibleSheets,
                gmAddStyleCalls: (window.__probeGmAddStyle ?? []).length,
            },
            mutations: (() => {
                const m = window.__probeMutations ?? {};
                const buckets = Object.entries(m.buckets ?? {}).map(([s, n]) => [Number(s), n]).sort((a, b) => a[0] - b[0]);
                return {
                    total: m.total ?? 0,
                    byYomu: m.byYomu ?? 0,
                    byOther: m.byOther ?? 0,
                    elapsedSeconds: Math.round(((Date.now() - (m.started ?? Date.now())) / 1000)),
                    lastTenSeconds: buckets.slice(-10),
                    peakPerSecond: buckets.reduce((max, [, n]) => Math.max(max, n), 0),
                    samples: (m.samples ?? []).slice(0, 15),
                };
            })(),
        };
    });

    let settingsReport = null;
    if (OPEN_SETTINGS) {
        settingsReport = await page.evaluate(async () => {
            // The puck opens a radial menu; settings is one of its items.
            const fab = document.querySelector('.jpdb-reader-fab');
            fab?.click();
            await new Promise(r => setTimeout(r, 1500));
            const radialItems = [...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
            const settingsItem = radialItems.find(item => /settings|設定/i.test(item.textContent ?? '') || /settings/i.test(item.dataset.radialId ?? ''));
            settingsItem?.click();
            await new Promise(r => setTimeout(r, 2500));
            const dialog = document.querySelector('.jpdb-reader-settings');
            if (!dialog) {
                return {
                    opened: false,
                    radialItems: radialItems.map(item => item.dataset.radialId ?? item.textContent?.trim().slice(0, 24)),
                };
            }
            const style = getComputedStyle(dialog);
            const select = dialog.querySelector('select');
            const selectStyle = select ? getComputedStyle(select) : null;
            return {
                opened: true,
                root: dialog.getRootNode() === document ? 'document' : 'shadow',
                position: style.position,
                background: style.backgroundColor,
                borderRadius: style.borderRadius,
                boxShadow: style.boxShadow.slice(0, 60),
                display: style.display,
                width: dialog.getBoundingClientRect().width,
                left: dialog.getBoundingClientRect().left,
                selectAppearance: selectStyle ? selectStyle.appearance : null,
                selectBorder: selectStyle ? selectStyle.borderStyle : null,
                // Which sheet actually supplies the dialog's background — the
                // question that separates "sheet missing" from "sheet overridden".
                matchedRuleOrigins: (() => {
                    const out = [];
                    for (const sheet of document.styleSheets) {
                        let rules;
                        try { rules = sheet.cssRules; } catch { continue; }
                        for (const rule of rules) {
                            if (!rule.selectorText) continue;
                            try {
                                if (!dialog.matches(rule.selectorText)) continue;
                            } catch { continue; }
                            out.push({
                                selector: rule.selectorText.slice(0, 120),
                                owner: sheet.ownerNode?.dataset?.probeGmAddStyle ? 'gm_addStyle'
                                    : /jpdb-reader/.test(sheet.ownerNode?.textContent ?? '') ? 'yomu' : 'host',
                                background: rule.style.backgroundColor || rule.style.background || null,
                            });
                        }
                    }
                    return out.slice(0, 25);
                })(),
            };
        });
    }

    mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
    const tag = `${WITH_VOICEWORKS ? 'with-vw' : 'yomu-alone'}-${USE_SHIPPED ? 'shipped' : 'dist'}${flag('--no-resource-css') ? '-noresource' : ''}-${ENGINE}`;
    await page.screenshot({ path: path.join(ROOT, 'artifacts', `asmr-${tag}.png`), fullPage: false });

    console.log(JSON.stringify({
        tag,
        url: URL_UNDER_TEST,
        engine: ENGINE,
        build: USE_SHIPPED ? 'HEAD dist (v1.8.7 shipped)' : 'working-tree dist',
        withVoiceworks: WITH_VOICEWORKS,
        companions: COMPANIONS.map(c => path.basename(c)),
        contentSecurityPolicy: responseHeaders['content-security-policy'] ?? null,
        ...report,
        settings: settingsReport,
        badResponses: badResponses.slice(0, 15),
        bodyTextHead: await page.evaluate(() => (document.body?.innerText ?? '').slice(0, 500)),
        consoleErrors: consoleErrors.slice(0, 20),
        pageErrors: pageErrors.slice(0, 10),
        consoleTail: consoleAll.slice(-15),
    }, null, 2));
} finally {
    await browser.close();
}
