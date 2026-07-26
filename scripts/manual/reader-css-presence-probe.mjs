#!/usr/bin/env node
// Manual probe: is Yomu's STYLESHEET actually present and applying on a given
// real site?
//
// Hypothesis under test: on some sites the reader boots and annotates but its
// CSS never lands, and every visual symptom (unstyled settings dialog, no pitch
// underline, popover that "does not open", no furigana) is downstream of that
// one failure.
//
// What it measures, per site:
//   1. Style census — every <style>/<link> whose text carries a known Yomu
//      selector, with its character length. A tiny one means only
//      CRITICAL_READER_CSS landed; zero means no sheet at all.
//   2. Decisive computed styles that ONLY the full sheet provides:
//        .jpdb-reader-popover  -> position:fixed; z-index:2147483647
//        .jpdb-reader-fab      -> position:fixed
//      (CRITICAL_READER_CSS gives the popover pointer-events only, never
//      position/z-index, so these separate "full sheet" from "critical only".)
//   3. CSP violations ('securitypolicyviolation') and failed responses for the
//      reader-CSS fallback URL.
//   4. What GM_getResourceText('yomuCss') returned. --break-resource makes the
//      shim return '' so the manager/CSP failure is actually reproduced rather
//      than papered over by a shim that always succeeds.
//   5. The hasLinkedReaderCss probe from ReaderApp.installStyles(), i.e. whether
//      the HOST page happens to link something matching /yomu.css.
//
//   node scripts/manual/reader-css-presence-probe.mjs --site reddit
//   node scripts/manual/reader-css-presence-probe.mjs --site asmr --with-voiceworks
//   node scripts/manual/reader-css-presence-probe.mjs --site yomuapp --break-resource
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as playwright from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SCRATCH = '/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/3f49dfc4-58d4-436d-8d70-f4dc54c5f3d8/scratchpad';

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const SITES = {
    reddit: 'https://www.reddit.com/r/japan/?rdt=1',
    asmr: 'https://asmr-200.com/work/RJ01052162',
    yomuapp: 'https://yomuapp.jp/reader',
};
const SITE = value('--site', 'reddit');
const URL_UNDER_TEST = value('--url', SITES[SITE] ?? SITES.reddit);
const ENGINE = value('--engine', 'chromium');
const WITH_VOICEWORKS = flag('--with-voiceworks') || SITE === 'asmr';
const BREAK_RESOURCE = flag('--break-resource');
const BLOCK_FALLBACK = flag('--block-fallback');
// --offline-css kills the fallback at the network layer too, so NOTHING but
// CRITICAL_READER_CSS can land. That is the state the hypothesis predicts, and
// the only way to compare the resulting page against the owner's screenshots.
const OFFLINE_CSS = flag('--offline-css');
const OPEN_SETTINGS = flag('--open-settings');
const SETTLE_MS = Number(value('--settle', '22000'));
// asmr.one answers 403 "remember, no english" to any English- OR Japanese-first
// Accept-Language (verified by curl: en-US 403, ja-JP 403, zh-CN 200). The real
// userscript recovers by re-fetching the shell over GM_xmlhttpRequest with a
// Chinese-first header; a probe cannot set Accept-Language from page fetch, so
// send a passing header on the navigation itself and let the SPA render.
const ACCEPT_LANGUAGE = value('--accept-language', SITE === 'asmr' ? 'zh-CN,zh;q=0.9,ja;q=0.8' : 'ja,en;q=0.8');
const LOCALE = value('--locale', SITE === 'asmr' ? 'zh-CN' : 'ja-JP');

// --shipped probes the committed dist at HEAD (what the owner actually runs);
// the default probes the working tree's dist, which may carry unshipped work.
const BUILD_DIR = flag('--shipped') ? path.join(SCRATCH, 'asmr-probe/shipped') : path.join(ROOT, 'dist');
const USERSCRIPT = path.join(BUILD_DIR, 'yomu.user.js');
const CSS = path.join(BUILD_DIR, 'yomu.css');
const VOICEWORKS = path.join(SCRATCH, 'voiceworks/asmr-one-ultimate.user.js');
const VW_REQUIRES = path.join(SCRATCH, 'vw-requires');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';

// Resolve companions from the userscript's own @require list: loading a subset
// silently breaks annotation and would mislead the measurement.
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

const resourceCss = BREAK_RESOURCE ? '' : readFileSync(CSS, 'utf8');

const gmShim = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ [SETTINGS_KEY]: settings })}));
  const listeners = new Map();
  window.__probeCss = { resourceCalls: [], addStyle: [], gmRequests: [], cspViolations: [] };
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = k => store.delete(k);
  window.GM_listValues = () => [...store.keys()];
  window.GM_addValueChangeListener = (k, f) => { const a = listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = () => {};
  window.GM_addStyle = css => {
    window.__probeCss.addStyle.push(String(css).length);
    const style = document.createElement('style');
    style.textContent = css;
    style.dataset.probeGmAddStyle = 'true';
    (document.head || document.documentElement).appendChild(style);
    return style;
  };
  const RESOURCE_CSS = ${JSON.stringify(resourceCss)};
  window.GM_getResourceText = n => {
    const out = n === 'yomuCss' ? RESOURCE_CSS : '';
    window.__probeCss.resourceCalls.push({ name: n, length: out.length });
    return out;
  };
  window.GM_info = { script: { version: 'probe', name: 'yomu' }, scriptHandler: 'ProbeGM' };
  window.unsafeWindow = window;
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: ()=>{}, addStyle: c=>window.GM_addStyle(c),
    xmlHttpRequest: o=>window.GM_xmlhttpRequest(o),
  };
  const BLOCK_FALLBACK = ${BLOCK_FALLBACK ? 'true' : 'false'};
  // A real cross-origin bridge, not page fetch. A fetch-based shim is
  // CORS-blocked and cannot set Accept-Language, which breaks BOTH scripts:
  // voiceworks' language-gate recovery and Yomu's jiten/jpdb lookups. With a
  // fetch shim the asmr page renders "Network Error" and Yomu never parses, so
  // any CSS reading taken from it would be measuring the harness.
  window.GM_xmlhttpRequest = o => {
    window.__probeCss.gmRequests.push(String(o.url).slice(0, 160));
    if (BLOCK_FALLBACK && /yomu\\.css/.test(String(o.url))) { o.onerror?.({ status: 0, error: 'blocked by probe' }); return { abort(){} }; }
    const headers = Object.assign({ 'Accept-Language': ${JSON.stringify(ACCEPT_LANGUAGE)} }, o.headers || {});
    window.__probeGmFetch({
      url: String(o.url),
      method: o.method || 'GET',
      headers,
      data: typeof o.data === 'string' ? o.data : undefined,
    }).then(r => {
      if (r && r.error) { o.onerror?.(r); return; }
      o.onload?.({ status: r.status, statusText: r.statusText, responseText: r.responseText, response: r.responseText, responseHeaders: r.responseHeaders, finalUrl: r.finalUrl });
    }).catch(e => o.onerror?.({ status: 0, error: String(e) }));
    return { abort(){} };
  };
  addEventListener('securitypolicyviolation', e => {
    window.__probeCss.cspViolations.push({
      directive: e.effectiveDirective || e.violatedDirective,
      blockedURI: String(e.blockedURI).slice(0, 160),
      source: String(e.sourceFile || '').slice(0, 80),
    });
  }, true);
})();`;

const engine = playwright[ENGINE];
const browser = await engine.launch({ headless: true });
try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        locale: LOCALE,
        userAgent: ENGINE === 'chromium'
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
            : undefined,
        extraHTTPHeaders: { 'Accept-Language': ACCEPT_LANGUAGE },
        bypassCSP: true,
    });
    // Node-side executor for GM_xmlhttpRequest: no same-origin policy, and it
    // can set Accept-Language (a forbidden header for page fetch).
    await context.exposeFunction('__probeGmFetch', async options => {
        try {
            const response = await fetch(options.url, {
                method: options.method ?? 'GET',
                headers: options.headers,
                body: options.data,
                redirect: 'follow',
            });
            return {
                status: response.status,
                statusText: response.statusText,
                responseText: await response.text(),
                responseHeaders: [...response.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n'),
                finalUrl: response.url,
            };
        } catch (error) {
            return { error: String(error), status: 0 };
        }
    });
    await context.addInitScript({ content: gmShim });
    // voiceworks is @run-at document-start and installed before Yomu; its own
    // @require chain (vue + systemjs) must land first or it never boots and the
    // site never renders.
    if (WITH_VOICEWORKS) {
        if (!existsSync(VOICEWORKS)) throw new Error(`Missing voiceworks userscript: ${VOICEWORKS}`);
        for (const dep of readdirSync(VW_REQUIRES).sort()) {
            await context.addInitScript({ path: path.join(VW_REQUIRES, dep) });
        }
        await context.addInitScript({ path: VOICEWORKS });
    }
    for (const companion of COMPANIONS) await context.addInitScript({ path: companion });
    await context.addInitScript({ path: USERSCRIPT });

    if (OFFLINE_CSS) await context.route(/yomu\.css/, route => route.abort('failed'));

    const page = await context.newPage();
    const consoleAll = [];
    const pageErrors = [];
    const cssResponses = [];
    const badResponses = [];
    page.on('console', message => consoleAll.push(`${message.type()}: ${message.text().slice(0, 220)}`));
    page.on('pageerror', error => pageErrors.push(String(error).slice(0, 300)));
    page.on('response', response => {
        const url = response.url();
        if (/yomu\.css/.test(url)) cssResponses.push(`${response.status()} ${url.slice(0, 140)}`);
        if (response.status() >= 400) badResponses.push(`${response.status()} ${url.slice(0, 130)}`);
    });
    page.on('requestfailed', request => {
        const url = request.url();
        if (/yomu\.css/.test(url)) cssResponses.push(`FAILED ${request.failure()?.errorText ?? '?'} ${url.slice(0, 140)}`);
    });

    await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 120_000 }).catch(async error => {
        if (!/NS_BINDING_ABORTED/.test(String(error))) throw error;
        await page.waitForTimeout(2_000);
        await page.goto(URL_UNDER_TEST, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    });
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => scrollTo(0, 400));
    await page.waitForTimeout(8_000);

    const report = await page.evaluate(() => {
        const jaRe = /[぀-ヿ㐀-鿿]/u;
        const bodyText = document.body?.innerText ?? '';
        const jaChars = (bodyText.match(/[぀-ヿ㐀-鿿]/gu) ?? []).length;

        // --- 1. style census -------------------------------------------------
        const nodes = [...document.querySelectorAll('style,link[rel=stylesheet]')];
        const readerSheets = nodes
            .filter(n => n.tagName === 'STYLE' && (n.textContent ?? '').includes('.jpdb-reader-word'))
            .map(n => {
                const text = n.textContent ?? '';
                return {
                    length: text.length,
                    hasPopoverPosition: /\.jpdb-reader-popover[^{}]*\{[^}]*position/.test(text),
                    hasSettingsRules: text.includes('.jpdb-reader-settings'),
                    hasFabRules: text.includes('.jpdb-reader-fab'),
                    hasLayer: text.includes('@layer'),
                    viaGmAddStyle: n.dataset.probeGmAddStyle === 'true',
                    connected: n.isConnected,
                    parent: n.parentElement?.tagName ?? null,
                };
            });

        // --- 2. decisive computed styles ------------------------------------
        const probeRoot = document.createElement('div');
        probeRoot.style.cssText = 'position:absolute;left:-9999px;top:0';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        const fab = document.createElement('button');
        fab.className = 'jpdb-reader-fab';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-pitch-heiban';
        word.textContent = '日本語';
        probeRoot.append(popover, fab, word);
        document.body.appendChild(probeRoot);
        const popoverStyle = getComputedStyle(popover);
        const fabStyle = getComputedStyle(fab);
        const wordStyle = getComputedStyle(word);
        const decisive = {
            popoverPosition: popoverStyle.position,
            popoverZIndex: popoverStyle.zIndex,
            popoverBackground: popoverStyle.backgroundColor,
            popoverPointerEvents: popoverStyle.pointerEvents,
            fabPosition: fabStyle.position,
            fabDisplay: fabStyle.display,
            wordTextDecorationLine: wordStyle.textDecorationLine,
            wordTextUnderlineOffset: wordStyle.textUnderlineOffset,
            wordPitchVar: wordStyle.getPropertyValue('--pc').trim().slice(0, 40),
        };
        probeRoot.remove();

        // --- 5. host link collision ------------------------------------------
        const linkNode = document.querySelector('link[href$="/yomu.css"], link[href*="/yomu.css?"]');

        // real annotation state on the live page
        const words = [...document.querySelectorAll('.jpdb-reader-word')];
        const liveWord = words.find(w => w.textContent?.trim());
        const liveWordStyle = liveWord ? getComputedStyle(liveWord) : null;

        return {
            location: location.href,
            title: document.title,
            rendered: { bodyTextLength: bodyText.length, jaChars, head: bodyText.replace(/\s+/g, ' ').trim().slice(0, 220) },
            boot: {
                realApp: Boolean(window.__yomuRealApp),
                fab: Boolean(document.querySelector('.jpdb-reader-fab')),
                companionKeys: Object.keys(window.__yomuCompanions ?? {}).length,
                settingsSurface: Boolean(window.__yomuCompanions?.settings?.SettingsDialogController),
            },
            styleCensus: {
                totalStyleNodes: nodes.length,
                readerSheetCount: readerSheets.length,
                readerSheets,
                readerSheetTotalLength: readerSheets.reduce((sum, s) => sum + s.length, 0),
            },
            decisive,
            hostLinkCollision: linkNode ? { href: linkNode.href.slice(0, 160) } : null,
            annotation: {
                words: words.length,
                wordsWithRuby: words.filter(w => w.querySelector('rt')).length,
                liveWordDecoration: liveWordStyle?.textDecorationLine ?? null,
                liveWordUnderlineColor: liveWordStyle?.getPropertyValue('--yu')?.trim() ?? null,
                // Words with resolved readings/pitch prove the parse ran; the
                // paint question is then about the overlay, not the pipeline.
                wordsWithReading: words.filter(w => w.dataset.reading).length,
                wordsWithPitchClass: words.filter(w => w.dataset.pitchClass).length,
                mirrorWords: document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-word').length,
            },
            // Furigana on mirror-rendered sites is painted by the detached
            // reading overlay (absolutely positioned readings), not <ruby>.
            detachedOverlay: (() => {
                const overlays = [...document.querySelectorAll('.jpdb-reader-detached-reading-overlay')];
                const readings = [...document.querySelectorAll('[data-yomu-projected-reading="true"], .jpdb-reader-detached-furi')];
                const painted = readings.filter(r => {
                    const s = getComputedStyle(r);
                    const rect = r.getBoundingClientRect();
                    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
                });
                const onScreen = painted.filter(r => {
                    const rect = r.getBoundingClientRect();
                    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
                });
                const sample = readings[0];
                return {
                    overlayCount: overlays.length,
                    overlayStyles: overlays.slice(0, 2).map(o => {
                        const s = getComputedStyle(o);
                        const rect = o.getBoundingClientRect();
                        return { position: s.position, zIndex: s.zIndex, display: s.display, opacity: s.opacity, width: Math.round(rect.width), height: Math.round(rect.height), children: o.childElementCount };
                    }),
                    readingsTotal: readings.length,
                    readingsPainted: painted.length,
                    readingsOnScreen: onScreen.length,
                    sample: sample
                        ? {
                            text: (sample.textContent ?? '').slice(0, 12),
                            fontSize: getComputedStyle(sample).fontSize,
                            position: getComputedStyle(sample).position,
                            rect: (() => { const r = sample.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; })(),
                        }
                        : null,
                };
            })(),
            gm: {
                resourceCalls: window.__probeCss.resourceCalls,
                addStyleLengths: window.__probeCss.addStyle,
                gmRequests: window.__probeCss.gmRequests.filter(u => /yomu\.css/.test(u)),
                cspViolations: window.__probeCss.cspViolations.slice(0, 15),
            },
        };
    });

    let settingsReport = null;
    if (OPEN_SETTINGS) {
        settingsReport = await page.evaluate(async () => {
            const fab = document.querySelector('.jpdb-reader-fab');
            fab?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            fab?.click();
            await new Promise(r => setTimeout(r, 3000));
            const dialog = document.querySelector('.jpdb-reader-settings');
            if (!dialog) return { opened: false };
            const style = getComputedStyle(dialog);
            const rect = dialog.getBoundingClientRect();
            const select = dialog.querySelector('select');
            return {
                opened: true,
                position: style.position,
                zIndex: style.zIndex,
                background: style.backgroundColor,
                borderRadius: style.borderRadius,
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                selectAppearance: select ? getComputedStyle(select).appearance : null,
            };
        });
    }

    mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
    const tag = `${SITE}-${ENGINE}${WITH_VOICEWORKS ? '-vw' : ''}${BREAK_RESOURCE ? '-noresource' : ''}${BLOCK_FALLBACK ? '-noflb' : ''}${OFFLINE_CSS ? '-offlinecss' : ''}`;
    await page.screenshot({ path: path.join(ROOT, 'artifacts', `css-presence-${tag}.png`) });

    // Render gate: measuring CSS on a gate/error page is worthless. asmr.one
    // answers 403 with a 2-line "remember, no english" page, and a failed SPA
    // boot leaves only a "Network Error" toast, so require real host Japanese.
    const hostJaChars = report.rendered.jaChars;
    const renderOk = report.rendered.bodyTextLength > 400 && hostJaChars > 30;

    console.log(JSON.stringify({
        tag,
        renderOk,
        url: URL_UNDER_TEST,
        engine: ENGINE,
        withVoiceworks: WITH_VOICEWORKS,
        breakResource: BREAK_RESOURCE,
        blockFallback: BLOCK_FALLBACK,
        ...report,
        network: { cssResponses, badResponses: badResponses.slice(0, 10) },
        settings: settingsReport,
        pageErrors: pageErrors.slice(0, 8),
        consoleTail: consoleAll.slice(-12),
    }, null, 2));
} finally {
    await browser.close();
}
