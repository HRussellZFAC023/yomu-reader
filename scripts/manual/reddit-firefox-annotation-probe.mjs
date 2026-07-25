#!/usr/bin/env node
// Manual probe: real reddit.com in FIREFOX with the built userscript, checking
// the three symptoms the owner reported on the latest build:
//   1. "settings companion did not load"
//   2. elements missing furigana
//   3. elements that only show furigana on hover
//
// Firefox specifically: the owner reproduces there, and it is the engine the
// repo exercises least (the smokes run Chromium and WebKit).
//
//   node scripts/manual/reddit-firefox-annotation-probe.mjs [url]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const USERSCRIPT = path.join(ROOT, 'dist/yomu.user.js');
const CSS = path.join(ROOT, 'dist/yomu.css');
const URL_UNDER_TEST = process.argv[2] ?? 'https://www.reddit.com/r/japan/?rdt=1';
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

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
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

const browser = await firefox.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja,en;q=0.8' },
        bypassCSP: true,
    });
    await context.addInitScript({ content: gmShim });
    for (const companion of COMPANIONS) await context.addInitScript({ path: companion });
    await context.addInitScript({ path: USERSCRIPT });

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', message => {
        if (message.type() === 'error' || /companion|did not load/i.test(message.text())) {
            consoleErrors.push(message.text().slice(0, 200));
        }
    });
    page.on('pageerror', error => pageErrors.push(String(error).slice(0, 200)));

    // Reddit aborts the first navigation when it bounces through its own
    // redirect; retry once on that specific abort rather than failing the run.
    try {
        await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } catch (error) {
        if (!/NS_BINDING_ABORTED/.test(String(error))) throw error;
        await page.waitForTimeout(2_000);
        await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    }
    await page.waitForTimeout(18_000);
    await page.evaluate(() => scrollTo(0, 900));
    await page.waitForTimeout(8_000);

    const report = await page.evaluate(() => {
        const paints = element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        };
        const projected = [...document.querySelectorAll('[data-yomu-projected-reading="true"]')];
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        // A word whose reading exists but paints nowhere is the "missing
        // furigana" symptom; the hover-only symptom is the same word becoming
        // visible under :hover, which we sample separately below.
        const withSource = words.filter(w => w.querySelector('.jpdb-reader-detached-furi, rt'));
        return {
            companionsPresent: {
                // The registry publishes companions on __yomuCompanions; the
                // settings surface registers under `settings`.
                registryKeys: Object.keys(window.__yomuCompanions ?? {}),
                settingsSurface: Boolean(window.__yomuCompanions?.settings?.SettingsDialogController),
                annotations: Boolean(document.querySelector('.jpdb-reader-detached-reading-overlay')),
            },
            readerBooted: Boolean(document.querySelector('.jpdb-reader-fab, [data-jpdb-reader-root]')),
            words: words.length,
            wordsWithSourceReading: withSource.length,
            projectedTotal: projected.length,
            projectedVisible: projected.filter(paints).length,
            hiddenSamples: projected.filter(c => !paints(c)).slice(0, 8).map(c => {
                // Find the word this clone belongs to, then ask the two
                // questions that decide whether the own-control occlusion
                // exemption can apply at all: is the word inside a shadow root,
                // and does a plain closest() (which does NOT cross shadow
                // boundaries) find its control?
                const expression = c.dataset.yomuExpression ?? '';
                const deepFind = (root, depth) => {
                    for (const el of root.querySelectorAll('.jpdb-reader-word')) {
                        if ((el.dataset.expression ?? '') === expression && expression) return { el, depth };
                        if (el.shadowRoot) { const hit = deepFind(el.shadowRoot, depth + 1); if (hit) return hit; }
                    }
                    for (const host of root.querySelectorAll('*')) {
                        if (host.shadowRoot) { const hit = deepFind(host.shadowRoot, depth + 1); if (hit) return hit; }
                    }
                    return null;
                };
                const found = expression ? deepFind(document, 0) : null;
                const word = found?.el ?? null;
                const CONTROLS = 'button,summary,label,[role="button"],[role="tab"],[role="menuitem"],[role="option"]';
                return {
                    text: c.textContent,
                    display: getComputedStyle(c).display,
                    expression,
                    inShadow: word ? word.getRootNode() !== document : null,
                    closestControlFound: word ? Boolean(word.closest(CONTROLS)) : null,
                };
            }),
            // Anything still gated on hover would show up as a rule the page
            // resolves only under :hover; report any surviving marker.
            commandMarkers: document.querySelectorAll('[data-yomu-command-control]').length,
            commandMirrors: document.querySelectorAll('[data-yomu-control-mirror="command"]').length,
        };
    });

    console.log(JSON.stringify({
        url: URL_UNDER_TEST,
        engine: 'firefox',
        ...report,
        consoleErrors: consoleErrors.slice(0, 8),
        pageErrors: pageErrors.slice(0, 5),
    }, null, 2));
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'reddit-firefox-probe.png') });
} finally {
    await browser.close();
}
