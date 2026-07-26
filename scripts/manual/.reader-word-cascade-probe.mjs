#!/usr/bin/env node
// Follow-up: the reader sheet IS present on asmr-200, yet live .jpdb-reader-word
// computes text-decoration:none while a synthetic one in a bare div computes
// underline. Enumerate every author rule that matches a live word and touches
// the decoration/ruby channel, and say which sheet it came from.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/3f49dfc4-58d4-436d-8d70-f4dc54c5f3d8/scratchpad';
const argv = process.argv.slice(2);
const value = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const SITE = value('--site', 'asmr');
const URL_UNDER_TEST = value('--url', SITE === 'asmr' ? 'https://asmr-200.com/work/RJ01052162' : 'https://www.reddit.com/r/japan/?rdt=1');
const WITH_VOICEWORKS = SITE === 'asmr' && !argv.includes('--no-voiceworks');
const ACCEPT_LANGUAGE = SITE === 'asmr' ? 'zh-CN,zh;q=0.9,ja;q=0.8' : 'ja,en;q=0.8';

const BUILD_DIR = argv.includes('--shipped') ? path.join(SCRATCH, 'asmr-probe/shipped') : path.join(ROOT, 'dist');
const USERSCRIPT = path.join(BUILD_DIR, 'yomu.user.js');
const CSS = path.join(BUILD_DIR, 'yomu.css');
const COMPANIONS = readFileSync(USERSCRIPT, 'utf8').split(/\r?\n/u).flatMap(line => {
    const m = line.match(/^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/u);
    return m ? [path.join(ROOT, 'docs/public/greasyfork', path.basename(m[1]))] : [];
});
const settings = { onboardingSeen: true, interfaceLanguage: 'en', apiKey: '', ankiEnabled: false, localDictionariesEnabled: true, showFloatingButton: true, furiganaMode: 'all', subtitlePlayerEnabled: false };

const gmShim = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ 'jpdb-popup-reader-settings': settings })}));
  const listeners = new Map();
  window.GM_getValue = (k,d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k,v) => { const o = store.get(k); store.set(k,v); (listeners.get(k)||[]).forEach(f=>{try{f(k,o,v,false)}catch{}}); };
  window.GM_deleteValue = k => store.delete(k);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (k,f) => { const a = listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  window.GM_addStyle = css => { const s = document.createElement('style'); s.textContent = css; s.dataset.gmAddStyle='true'; (document.head||document.documentElement).appendChild(s); return s; };
  window.GM_getResourceText = n => n === 'yomuCss' ? ${JSON.stringify(readFileSync(CSS, 'utf8'))} : '';
  window.GM_info = { script: { version: 'probe', name: 'yomu' }, scriptHandler: 'ProbeGM' };
  window.unsafeWindow = window;
  window.GM = { getValue: async(k,d)=>window.GM_getValue(k,d), setValue: async(k,v)=>window.GM_setValue(k,v), deleteValue: async k=>window.GM_deleteValue(k), listValues: async()=>window.GM_listValues(), registerMenuCommand: ()=>{}, openInTab: ()=>{}, addStyle: c=>window.GM_addStyle(c), xmlHttpRequest: o=>window.GM_xmlhttpRequest(o) };
  window.GM_xmlhttpRequest = o => {
    const headers = Object.assign({ 'Accept-Language': ${JSON.stringify(ACCEPT_LANGUAGE)} }, o.headers||{});
    window.__probeGmFetch({ url: String(o.url), method: o.method||'GET', headers, data: typeof o.data==='string'?o.data:undefined })
      .then(r => { if (r && r.error) { o.onerror?.(r); return; } o.onload?.({ status:r.status, statusText:r.statusText, responseText:r.responseText, response:r.responseText, responseHeaders:r.responseHeaders, finalUrl:r.finalUrl }); })
      .catch(e => o.onerror?.({ status:0, error:String(e) }));
    return { abort(){} };
  };
})();`;

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        locale: SITE === 'asmr' ? 'zh-CN' : 'ja-JP',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': ACCEPT_LANGUAGE },
        bypassCSP: true,
    });
    await context.exposeFunction('__probeGmFetch', async o => {
        try {
            const r = await fetch(o.url, { method: o.method ?? 'GET', headers: o.headers, body: o.data, redirect: 'follow' });
            return { status: r.status, statusText: r.statusText, responseText: await r.text(), responseHeaders: [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n'), finalUrl: r.url };
        } catch (error) { return { error: String(error), status: 0 }; }
    });
    await context.addInitScript({ content: gmShim });
    if (WITH_VOICEWORKS) {
        for (const dep of readdirSync(path.join(SCRATCH, 'vw-requires')).sort()) await context.addInitScript({ path: path.join(SCRATCH, 'vw-requires', dep) });
        await context.addInitScript({ path: path.join(SCRATCH, 'voiceworks/asmr-one-ultimate.user.js') });
    }
    for (const c of COMPANIONS) { if (!existsSync(c)) throw new Error(`missing ${c}`); await context.addInitScript({ path: c }); }
    await context.addInitScript({ path: USERSCRIPT });

    const page = await context.newPage();
    await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(Number(value('--settle', '32000')));

    const out = await page.evaluate(() => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        const sheetLabel = sheet => {
            const node = sheet.ownerNode;
            if (!node) return 'imported';
            if (node.tagName === 'LINK') return `link:${String(node.href).split('/').pop()}`;
            const text = node.textContent ?? '';
            if (text.includes('.jpdb-reader-popover')) return 'yomu-full';
            if (text.includes('.jpdb-reader-word')) return 'yomu-critical';
            if (node.dataset?.gmAddStyle) return 'gm_addStyle(other-script)';
            return `inline-style(${text.length})`;
        };
        const describe = word => {
            const style = getComputedStyle(word);
            const hits = [];
            for (const sheet of document.styleSheets) {
                let rules;
                try { rules = sheet.cssRules; } catch { continue; }
                const walk = list => {
                    for (const rule of list) {
                        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
                        if (!rule.selectorText) continue;
                        let matches = false;
                        try { matches = word.matches(rule.selectorText); } catch { continue; }
                        if (!matches) continue;
                        const decl = rule.style;
                        const interesting = ['text-decoration', 'text-decoration-line', 'text-decoration-color', 'display', 'font-size', 'line-height', 'ruby-position'];
                        for (const prop of interesting) {
                            const v = decl.getPropertyValue(prop);
                            if (!v) continue;
                            hits.push({ sheet: sheetLabel(sheet), selector: rule.selectorText.slice(0, 90), prop, value: v.slice(0, 60), important: decl.getPropertyPriority(prop) === 'important' });
                        }
                    }
                };
                walk(rules);
            }
            const parents = [];
            for (let n = word.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
                parents.push(`${n.tagName}.${String(n.className?.baseVal ?? n.className ?? '').trim().slice(0, 50)}`);
            }
            return {
                text: (word.textContent ?? '').slice(0, 14),
                inShadow: word.getRootNode() !== document,
                computedDecorationLine: style.textDecorationLine,
                computedDecorationColor: style.textDecorationColor,
                afterContent: getComputedStyle(word, '::after').content,
                afterBorderBottom: getComputedStyle(word, '::after').borderBottomWidth,
                hasRt: Boolean(word.querySelector('rt')),
                hasRuby: Boolean(word.querySelector('ruby')),
                classes: word.className.slice(0, 120),
                dataset: { ...word.dataset },
                parents,
                decorationRules: hits,
            };
        };
        return {
            wordCount: words.length,
            withRuby: words.filter(w => w.querySelector('rt')).length,
            samples: words.slice(0, 3).map(describe),
            // Which parse states exist — no-ruby could just mean "no readings yet"
            stateCensus: words.reduce((acc, w) => {
                const state = w.dataset.jpdbState ?? w.dataset.state ?? w.getAttribute('data-jpdb-state') ?? 'none';
                acc[state] = (acc[state] ?? 0) + 1;
                return acc;
            }, {}),
            furiganaSetting: window.__yomuRealApp?.settings?.furiganaMode ?? null,
        };
    });
    console.log(JSON.stringify(out, null, 2));
} finally {
    await browser.close();
}
